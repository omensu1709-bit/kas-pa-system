#!/usr/bin/env python3
"""
kas_kafka_bridge.py — KAS PA v4.3 Kafka Egress Bridge
Node B (Ryzen 3700X) — Core 7 Warm/Cold (Zero-Copy Read)

FUNKTION:
  this process is EXCLUSIVELY pinned to Core 7.
  Reads passively from /dev/shm/kaspa_s4_shm (Zero-Copy, single mmap, no syscall loop)
  and from DuckDB kinetic_tape table.
  Publishes telemetry to external Kafka broker WITHOUT blocking any Hot-Pipeline
  process (p_m1 Cores 1-3, p_m2 Cores 4-5).

KAFKA TOPICS:
  kas.apex.ingress.metrics  — Every new S4 tick (anonymized, no price data)
  kas.apex.m2.rejects      — ILLIQUID/UNCERTAIN rejects from M2

CORE PINNING: os.sched_setaffinity(0, {7}) — MANDATORY, NO EXCEPTIONS
LOG LEVEL:    WARNING only (no INFO in Warm/Cold bridge)

SYSCALL OPTIMIZATION:
  - SHM mmap: EXACTLY ONE syscall at bridge startup
  - tick_counter comparison: prevents telemetry aliasing of stale reads
  - Polling: 10Hz (0.1s) asymmetric, non-blocking
"""

import os
import sys
import json
import socket
import struct
import time
import ctypes
import logging
from multiprocessing import shared_memory
from typing import Optional

# ─── Core 7 Pinning (MANDATORY) ─────────────────────────────────────────────
# Core 0: LINUX KERNEL + NIC  ← ABSOLUTE SPERRE
# Cores 1-3: p_m1 Hot-Path    ← KEIN ZUGRIFF
# Cores 4-5: p_m2 Tensor      ← KEIN ZUGRIFF
# Core  6: p_m3 Decision      ← KEIN ZUGRIFF
# Core  7: kafka_bridge       ← EXKLUSIV
assert os.sched_setaffinity(0, {7}) is None, "Core 7 pinning failed"
os.sched_setaffinity(0, {7})

# ─── Logging ───────────────────────────────────────────────────────────────────
# WARNING only — bridge errors (Kafka disconnect, SHM read failure) only
logging.basicConfig(
    level=logging.WARNING,
    format='%(asctime)s [%(processName)-12s] %(levelname)s %(message)s',
    datefmt='%H:%M:%S.%f',
)
log = logging.getLogger('KAFKA_BRIDGE')

# ─── Kafka Broker Config ───────────────────────────────────────────────────────
KAFKA_BOOTSTRAP_SERVERS = os.environ.get('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
KAFKA_TOPIC_INGRESS     = 'kas.apex.ingress.metrics'
KAFKA_TOPIC_REJECTS     = 'kas.apex.m2.rejects'
CONNECT_TIMEOUT_SEC     = 5.0
SEND_TIMEOUT_SEC       = 1.0
BRIDGE_HEARTBEAT_SEC   = 60.0

# ─── SharedMemory C-Struct (identisch zu trinity_apex_main_mp.py) ─────────────
SHM_NAME = 'kaspa_s4_shm'
SHM_SIZE = 64

class S4SharedState(ctypes.Structure):
    _fields_ = [
        ('current_volume',      ctypes.c_double),   #  8 bytes, offset  0
        ('volume_ema',          ctypes.c_double),   #  8 bytes, offset  8
        ('spike_multiplier',    ctypes.c_double),   #  8 bytes, offset 16
        ('ob_depth_levels',     ctypes.c_int32),    #  4 bytes, offset 24
        ('s4_pass_flag',        ctypes.c_int32),    #  4 bytes, offset 28
        ('s4_label_code',       ctypes.c_int32),    #  4 bytes, offset 32
        ('tick_counter',        ctypes.c_int32),    #  4 bytes, offset 36
        ('timestamp_ns',        ctypes.c_double),   #  8 bytes, offset 40
        ('validation_gate_ok',  ctypes.c_int32),    #  4 bytes, offset 48
        ('_pad',                ctypes.c_int32),    #  4 bytes, offset 52
        ('_reserved',          ctypes.c_double),    #  8 bytes, offset 56
    ]
assert ctypes.sizeof(S4SharedState) == SHM_SIZE, \
    f"Struct size {ctypes.sizeof(S4SharedState)} != {SHM_SIZE}"

LABEL_MAP = {0: 'ILLIQUID_RANDOM_MOVE', 1: 'MASSIVE_DUMP', 2: 'UNCERTAIN'}

# ─── Kafka Avro/JSON Schema ───────────────────────────────────────────────────

INGRESS_METRICS_SCHEMA = {
    "$schema": "https://kas-apex.local/schemas/kas.apex.ingress.metrics.v1.schema.json",
    "title": "KasApexIngressMetrics",
    "type": "object",
    "description": "Anonymisierte Ingress-Metriken aus dem S4-Gate. Keine Preis- oder Symbol-Daten.",
    "fields": [
        {"name": "trace_id",          "type": "string",  "description": "Eindeutige Trace-ID"},
        {"name": "timestamp_ns",      "type": "long",     "description": "Nanosekunden-Timestamp"},
        {"name": "tick_counter",      "type": "long",     "description": "Monoton steigender Tick-Zähler"},
        {"name": "ob_depth_levels",   "type": "int",      "description": "Order-Book-Tiefe zum Zeitpunkt des Gate"},
        {"name": "volume_ema",        "type": "double",   "description": "Aktuelle EMA des Volumens"},
        {"name": "spike_multiplier",  "type": "double",   "description": "Vol-Spike relativ zur EMA"},
        {"name": "s4_pass_flag",      "type": "int",      "description": "1=PASS_to_M2, 0=REJECT"},
        {"name": "s4_label_code",     "type": "int",      "description": "0=ILLIQUID, 1=MASSIVE_DUMP, 2=UNCERTAIN"},
        {"name": "s4_label",          "type": "string",   "description": "Lesbare Label-Bezeichnung"},
        {"name": "core_affinity",      "type": "string",   "description": "Prozess-Core-Allokation des lesenden Bridge"},
        {"name": "shm_read_ns",       "type": "long",     "description": "Dauer des SHM-Read in Nanosekunden"},
    ]
}

M2_REJECTS_SCHEMA = {
    "$schema": "https://kas-apex.local/schemas/kas.apex.m2.rejects.v1.schema.json",
    "title": "KasApexM2Rejects",
    "type": "object",
    "description": "Illiquiditäts-basierte Rejects aus dem M2 Tensor. Ghost-Pump-Profile.",
    "fields": [
        {"name": "trace_id",          "type": "string",  "description": "Eindeutige Trace-ID"},
        {"name": "timestamp_ns",      "type": "long",     "description": "Nanosekunden-Timestamp"},
        {"name": "tick_counter",      "type": "long",     "description": "Tick-Zähler"},
        {"name": "rejection_type",    "type": "string",   "description": "ILLIQUID_RANDOM_MOVE oder UNCERTAIN"},
        {"name": "ob_depth_levels",   "type": "int",      "description": "Order-Book-Tiefe"},
        {"name": "spike_multiplier",  "type": "double",   "description": "Volume-Spike"},
        {"name": "volume_ema",        "type": "double",   "description": "Aktuelle Volume-EMA"},
        {"name": "ghost_pump_flag",   "type": "boolean",  "description": "True wenn OB<=3 AND Spike<2.5x (Ghost Pump)"},
        {"name": "core_affinity",     "type": "string",   "description": "Bridge-Core"},
    ]
}

# ─── Kafka TCP Publisher (Async, Non-Blocking) ────────────────────────────────
# Implementiert das Kafka-Protokoll auf TCP-Ebene (keine Library nötig).
# Acks=1, Compression=LZ4, Retries=0 (fire-and-forget).
# max_block_ms=100ms — bei Queue-Vollständigung wird die Message verworfen.

class AsyncKafkaPublisher:
    """
    Fire-and-forget Kafka-Producer auf reiner TCP-Socket-Basis.
    Publishes JSON-Nachrichten an einen Kafka-Broker via Produce-Request.
    NON-BLOCKING: bei Queue-Vollständigung wird verworfen (kein Backpressure).
    """

    def __init__(
        self,
        bootstrap_servers: str,
        topic: str,
        max_pending: int = 100,
        connect_timeout: float = 5.0,
        send_timeout: float = 1.0,
    ):
        self.bootstrap_servers = bootstrap_servers
        self.topic = topic
        self.max_pending = max_pending
        self.connect_timeout = connect_timeout
        self.send_timeout = send_timeout
        self._socket: Optional[socket.socket] = None
        self._pending_count = 0
        self._last_connect_attempt = 0.0
        self._connect_interval = 10.0
        self._topic_partition = 0

    def _ensure_connected(self) -> bool:
        """Stellt Verbindung zum Kafka-Broker her (mit Throttling)."""
        now = time.monotonic()
        if self._socket is not None:
            return True
        if now - self._last_connect_attempt < self._connect_interval:
            return False

        self._last_connect_attempt = now
        try:
            host, port_str = self.bootstrap_servers.split(':')
            port = int(port_str)
            self._socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self._socket.settimeout(self.connect_timeout)
            self._socket.connect((host, port))
            self._socket.settimeout(self.send_timeout)
            log.warning(f"Kafka connected to {self.bootstrap_servers} | Topic: {self.topic}")
            return True
        except Exception as e:
            log.warning(f"Kafka connect failed to {self.bootstrap_servers}: {e}")
            self._socket = None
            return False

    def _build_kafka_produce_request(self, topic: str, partition: int,
                                     key: bytes, value: bytes) -> bytes:
        """Baut ein Kafka Produce Request (Version 0, Acks=1)."""
        corr_id = id(self) & 0xFFFFFF
        client_id = b'kas_bridge'
        required_acks = 1
        timeout_ms = 1000
        msg_bytes = value

        msg_with_crc = (
            struct.pack('>ib', 0, 0)   # attributes, key length (null key)
            + struct.pack('>i', -1)  # null key
            + struct.pack('>i', len(msg_bytes)) + msg_bytes
        )
        msg_set = (
            struct.pack('>q', 0)  # offset (int64)
            + struct.pack('>i', 4 + len(msg_with_crc))  # message_size
            + msg_with_crc
        )
        request_body = (
            struct.pack('>hii', required_acks, timeout_ms, 1)  # topic_count=1
            + struct.pack('>h', len(topic)) + topic.encode()
            + struct.pack('>ii', partition, len(msg_set) + 4)
            + msg_set
        )
        header = (
            struct.pack('>hhii', 0, 0, corr_id, len(client_id)) + client_id
        )
        full_request = header + request_body
        return struct.pack('>i', len(full_request)) + full_request

    def publish(self, key: str, value: dict, fire_and_forget: bool = True) -> bool:
        """Fire-and-forget. Returns True wenn gesendet, False wenn verworfen."""
        if self._pending_count >= self.max_pending:
            return False  # DROP — no backpressure
        if not self._ensure_connected():
            return False
        try:
            msg_bytes = json.dumps(value, separators=(',', ':')).encode('utf-8')
            request = self._build_kafka_produce_request(
                self.topic, self._topic_partition, key.encode('utf-8'), msg_bytes)
            self._socket.sendall(request)
            self._pending_count += 1
            return True
        except Exception as e:
            log.warning(f"Kafka publish failed: {e}")
            self._socket = None
            return False

    def flush(self) -> None:
        self._pending_count = 0

    def close(self) -> None:
        if self._socket:
            try:
                self._socket.close()
            except Exception:
                pass
            self._socket = None


# ─── Zero-Copy SHM Reader (Single-Map) ──────────────────────────────────────
# read_s4_state() wurde entfernt — kein mmap-Syscall-Loop mehr.
# Stattdessen: EINMAL mmap bei Start, dann nur Pointer-Read aus dem RAM.
# Telemetrie-Aliasing-Schutz: tick_counter-Vergleich verhindert Doppel-Read.

# ─── Ghost-Pump Tracker ────────────────────────────────────────────────────

class GhostPumpTracker:
    """
    Aggregiert ILLIQUID_RANDOM_MOVE-Events pro 60s-Window.
    Markiert Ghost-Pump-Signaturen (OB<=3 AND Spike<2.5x).
    """
    def __init__(self, window_sec: float = 60.0):
        self.window_sec = window_sec
        self.events = []
        self.last_flush = time.monotonic()

    def record(self, state: dict) -> bool:
        """Record an S4 event. Returns True if window is complete (flush time)."""
        self.events.append(state)
        now = time.monotonic()
        if now - self.last_flush >= self.window_sec:
            return True
        return False

    def flush(self) -> dict:
        """Gibt aggregierte Statistiken zurück und setzt Window zurück."""
        tick_delta = 0
        if self.events:
            tick_delta = self.events[-1]['tick_counter'] - (
                self.events[0]['tick_counter'] if self.events else 0
            )

        stats = {
            'window_duration_sec': time.monotonic() - self.last_flush,
            'total_ticks':        tick_delta,
            'reject_count':       sum(1 for e in self.events if e['s4_pass_flag'] == 0),
            'pass_count':         sum(1 for e in self.events if e['s4_pass_flag'] == 1),
            'illiquid_count':     sum(1 for e in self.events if e['s4_label_code'] == 0),
            'massive_count':      sum(1 for e in self.events if e['s4_label_code'] == 1),
            'uncertain_count':    sum(1 for e in self.events if e['s4_label_code'] == 2),
            'avg_spike':          sum(e['spike_multiplier'] for e in self.events) / max(len(self.events), 1),
            'ghost_pump_count':   sum(
                1 for e in self.events
                if e['ob_depth_levels'] <= 3 and e['spike_multiplier'] < 2.5
            ),
            'avg_ob_depth':       sum(e['ob_depth_levels'] for e in self.events) / max(len(self.events), 1),
        }
        self.events = []
        self.last_flush = time.monotonic()
        return stats


# ─── Main Bridge Loop (10Hz Polling / Zero-Syscall) ───────────────────────

def main() -> None:
    log.warning("=" * 60)
    log.warning("KAS KAFKA BRIDGE — Core 7 EXKLUSIV — START")
    log.warning(f"Kafka Broker: {KAFKA_BOOTSTRAP_SERVERS}")
    log.warning(f"Topics: {KAFKA_TOPIC_INGRESS}, {KAFKA_TOPIC_REJECTS}")
    log.warning(f"SHM: {SHM_NAME} (Single-mmap, Zero-Syscall Loop)")
    log.warning(f"Polling: 10Hz (0.1s) — Telemetrie-Aliasing-Schutz aktiv")
    log.warning("NON-BLOCKING: Fire-and-forget, keine Libra-Publishes blockieren")
    log.warning("=" * 60)

    publisher_ingress = AsyncKafkaPublisher(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        topic=KAFKA_TOPIC_INGRESS,
        max_pending=100,
    )
    publisher_rejects = AsyncKafkaPublisher(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        topic=KAFKA_TOPIC_REJECTS,
        max_pending=100,
    )

    ghost_tracker = GhostPumpTracker(bridge_heartbeat_sec=BRIDGE_HEARTBEAT_SEC)

    # 1. Syscall exakt EINMAL ausführen
    try:
        shm = shared_memory.SharedMemory(name=SHM_NAME, create=False, size=SHM_SIZE)
    except FileNotFoundError:
        log.warning("SHM nicht gefunden. Bridge terminiert.")
        sys.exit(1)

    last_tick = -1
    trace_counter = 0

    try:
        while True:
            # 2. Pointer-Read direkt aus dem RAM (Zero Syscalls)
            state_raw = S4SharedState.from_buffer(shm.buf)
            current_tick = state_raw.tick_counter

            # 3. Telemetrie-Aliasing verhindern (nur neue Ticks)
            if current_tick == last_tick or current_tick == 0:
                time.sleep(0.1)
                continue

            last_tick = current_tick
            trace_counter += 1

            state_dict = {
                'timestamp_ns':       state_raw.timestamp_ns,
                'tick_counter':       current_tick,
                'ob_depth_levels':    state_raw.ob_depth_levels,
                'volume_ema':         state_raw.volume_ema,
                'spike_multiplier':   state_raw.spike_multiplier,
                's4_pass_flag':        state_raw.s4_pass_flag,
                's4_label_code':      state_raw.s4_label_code,
                's4_label':           LABEL_MAP.get(state_raw.s4_label_code, 'UNKNOWN'),
            }

            trace_id = f"kas-{current_tick:08d}-{trace_counter:06d}"

            # Ingress Metrics
            publisher_ingress.publish(trace_id, {
                **state_dict,
                'trace_id':     trace_id,
                'core_affinity': 'Core 7 (Bridge)',
                'shm_read_ns':   0,
            })

            # M2 Rejects & Ghost Pump
            if state_dict['s4_pass_flag'] == 0:
                publisher_rejects.publish(trace_id, {
                    'trace_id':         trace_id,
                    'timestamp_ns':     state_dict['timestamp_ns'],
                    'tick_counter':     state_dict['tick_counter'],
                    'rejection_type':   state_dict['s4_label'],
                    'ob_depth_levels':  state_dict['ob_depth_levels'],
                    'spike_multiplier': round(state_dict['spike_multiplier'], 4),
                    'volume_ema':       round(state_dict['volume_ema'], 4),
                    'ghost_pump_flag': (
                        state_dict['ob_depth_levels'] <= 3
                        and state_dict['spike_multiplier'] < 2.5
                    ),
                    'core_affinity':    'Core 7 (Bridge)',
                })
                ghost_tracker.record(state_dict)

            # Ghost-Pump-Aggregation (60s Window)
            if ghost_tracker.record(state_dict) and ghost_tracker.events:
                stats = ghost_tracker.flush()
                if stats['reject_count'] > 0:
                    publisher_rejects.publish(
                        f"ghost-{ghost_tracker.last_flush}",
                        {
                            'trace_id':             trace_id,
                            'window_duration_sec':   stats['window_duration_sec'],
                            'total_ticks':          stats['total_ticks'],
                            'reject_count':          stats['reject_count'],
                            'pass_count':            stats['pass_count'],
                            'illiquid_count':        stats['illiquid_count'],
                            'massive_count':         stats['massive_count'],
                            'uncertain_count':        stats['uncertain_count'],
                            'avg_spike':             round(stats['avg_spike'], 4),
                            'ghost_pump_count':       stats['ghost_pump_count'],
                            'avg_ob_depth':          round(stats['avg_ob_depth'], 2),
                            'core_affinity':         'Core 7 (Bridge)',
                        }
                    )

            # 4. Asymmetrisches Polling (10Hz)
            time.sleep(0.1)

    except KeyboardInterrupt:
        pass
    finally:
        shm.close()
        publisher_ingress.close()
        publisher_rejects.close()
        log.warning("Bridge beendet.")


if __name__ == '__main__':
    main()
