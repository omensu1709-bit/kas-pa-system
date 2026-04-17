#!/usr/bin/env python3
"""
trinity_apex_main_mp.py — KAS PA v4.3 Multi-Process Architecture
Node B (Ryzen 3700X) — Ground-Truth Validated Entry Point

AKTIVIERUNGSBEDINGUNG:
  Dieses Modul wird NUR aktiviert wenn ValidationGate = VALIDATED:
    - criticalCellCount(MASSIVE_DUMP↔ILLIQUID_RANDOM_MOVE) == 0
    - KAS-Score >= 0.85
    - Raw-Agreement >= 80%
    - Cohen's Kappa >= 0.70

PROZESS-ARCHITEKTUR:
  p_m1  | M1 Observer     | Core 0 | EMA-Tracker + S4-Gate | 1 Hz Tick-Rate
  p_m2  | M2 Tensor       | Core 1 | Metrik-Aggregation    | Empfängt S4-Pass-Through
  p_m3  | M3 Decision     | Core 2 | Bayesian Engine       | SHORT/MONITOR/IGNORE
  p_ctl | Control Loop    | Core 3 | Watchdog + Restart    | 5s Health-Check

SHARED MEMORY LAYOUT (C-Type, 64 Bytes pro Slot):
  Offset 0:  float64  current_volume        (8 bytes)
  Offset 8:  float64  volume_ema            (8 bytes)
  Offset 16: float64  spike_multiplier      (8 bytes)
  Offset 24: int32    ob_depth_levels       (4 bytes)
  Offset 28: int32    s4_pass_flag          (4 bytes, 0=REJECT, 1=PASS_TO_M2)
  Offset 32: int32    s4_label_code         (4 bytes, 0=ILLIQUID, 1=MASSIVE_DUMP, 2=UNCERTAIN)
  Offset 36: int32    tick_counter          (4 bytes)
  Offset 40: float64  timestamp_ns          (8 bytes)
  Offset 48: int32    validation_gate_ok    (4 bytes, 1=VALIDATED)
  Offset 52: int32    _pad                  (12 bytes padding → 64 total)
  Offset 56: float64  _reserved             (8 bytes)
"""

import os
import sys
import time
import ctypes
import logging
import multiprocessing
from multiprocessing import shared_memory, Event, Queue
from multiprocessing import cpu_count
from typing import Optional

import numpy as np
from numba import njit

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(processName)-12s] %(levelname)s %(message)s',
    datefmt='%H:%M:%S.%f',
)
logger = logging.getLogger('TRINITY_MP')

# ─── Konstanten ───────────────────────────────────────────────────────────────

# S4-Gate Schwellenwerte (aus review-runner.ts synchronisiert)
OB_DEPTH_THRESHOLD: int   = 3
VOLUME_SPIKE_REQ: float   = 2.5

# EMA-Alpha: 5-Minuten-Fenster bei 1 Hz = 300 Ticks
# EMA_ALPHA = 2 / (SPAN + 1) = 2 / (300 + 1) ≈ 0.00664
EMA_ALPHA: float = 0.00664

# SharedMemory-Name und Größe
SHM_NAME:   str = 'kaspa_s4_shm'
SHM_SIZE:   int = 64   # Bytes pro Slot (Cache-Line-aligned)

# Label-Codes (für SharedMemory int32-Slot)
LABEL_ILLIQUID:   int = 0
LABEL_MASSIVE:    int = 1
LABEL_UNCERTAIN:  int = 2

# CPU-Affinität (Ryzen 3700X, 8 Kerne / 16 Threads)
# Core 0: RESERVIERT FÜR LINUX-KERNEL + NIC — kein User-Space erlaubt
# Cores 1-3: p_m1 Hot-Path (Ingress, Numba-Math, S4-Gate)
# Cores 4-5: p_m2 Warm/Cold (Tensor-Aggregation)
# Core  6:   p_m3 Warm/Cold (Bayesian Decision / Brier-Watchdog)
# Core  7:   p_ctl Warm/Cold (Watchdog + Shutdown)
CPU_M1  = 1   # Hot-Path: Numba-Math + S4-Gate — Cores 1-3
CPU_M1_RANGE = {1, 2, 3}
CPU_M2  = 4   # Warm/Cold: Tensor-Aggregation — Cores 4-5
CPU_M2_RANGE = {4, 5}
CPU_M3  = 6   # Warm/Cold: Bayesian Decision
CPU_CTL = 7   # Warm/Cold: Watchdog

# ─── Numba AOT: Dynamischer S4-Gate (exakt wie spezifiziert + erweitert) ──────

@njit(fastmath=True, nogil=True, cache=True)
def calculate_dynamic_s4_gate(
    current_volume: float,
    previous_ema: float,
    ob_depth: int,
) -> tuple:
    """
    Deterministischer S4-Gate mit dynamischer EMA-Baseline.

    Returns:
        (new_ema, pass_to_m2, label_code, spike_multiplier)
        pass_to_m2:      True  = MASSIVE_DUMP → an M2 Tensor weitergeben
                         False = ILLIQUID oder UNCERTAIN → verwerfen
        label_code:      0 = ILLIQUID_RANDOM_MOVE
                         1 = MASSIVE_DUMP
                         2 = UNCERTAIN
        spike_multiplier: normierter Volume-Spike (0 wenn EMA ≈ 0)
    """
    # EMA aktualisieren
    new_ema = (current_volume * EMA_ALPHA) + (previous_ema * (1.0 - EMA_ALPHA))

    if ob_depth <= OB_DEPTH_THRESHOLD:
        # Division-by-Zero-Schutz im absoluten Marktvakuum
        if new_ema > 0.0001:
            spike_multiplier = current_volume / new_ema
        else:
            spike_multiplier = 0.0

        if spike_multiplier < VOLUME_SPIKE_REQ:
            # Flaches Buch, kein toxisches Volumen → stochastisches Rauschen
            return new_ema, False, LABEL_ILLIQUID, spike_multiplier

        # Flaches Buch MIT toxischem Volumen → echter Dump
        return new_ema, True, LABEL_MASSIVE, spike_multiplier

    # Orderbuch zu tief für ILLIQUID-Klassifikation
    spike_multiplier = current_volume / new_ema if new_ema > 0.0001 else 0.0
    return new_ema, False, LABEL_UNCERTAIN, spike_multiplier


# ─── SharedMemory C-Struct Layout ─────────────────────────────────────────────

class S4SharedState(ctypes.Structure):
    """
    64-Byte Cache-Line-aligned SharedMemory Struct.
    Wird von p_m1 geschrieben, von p_m2 und p_m3 gelesen.
    Kein Lock erforderlich: p_m1 ist einziger Writer, alle anderen sind Reader.
    """
    _fields_ = [
        ('current_volume',     ctypes.c_double),   # 8 bytes, offset 0
        ('volume_ema',         ctypes.c_double),   # 8 bytes, offset 8
        ('spike_multiplier',   ctypes.c_double),   # 8 bytes, offset 16
        ('ob_depth_levels',    ctypes.c_int32),    # 4 bytes, offset 24
        ('s4_pass_flag',       ctypes.c_int32),    # 4 bytes, offset 28
        ('s4_label_code',      ctypes.c_int32),    # 4 bytes, offset 32
        ('tick_counter',       ctypes.c_int32),    # 4 bytes, offset 36
        ('timestamp_ns',       ctypes.c_double),   # 8 bytes, offset 40
        ('validation_gate_ok', ctypes.c_int32),    # 4 bytes, offset 48
        ('_pad',               ctypes.c_int32),    # 4 bytes, offset 52
        ('_reserved',          ctypes.c_double),   # 8 bytes, offset 56
    ]

assert ctypes.sizeof(S4SharedState) == SHM_SIZE, \
    f"S4SharedState size {ctypes.sizeof(S4SharedState)} != {SHM_SIZE}"


# ─── p_m1: M1 Observer Prozess ────────────────────────────────────────────────

def p_m1_observer(
    shm_name: str,
    stop_event: Event,
    m2_queue: Queue,
    tick_interval: float = 1.0,
) -> None:
    """
    M1 Observer — Cores 1-3 (Hot-Path)
    Endlos-Loop bei 1 Hz. Liest current_volume + ob_depth aus der Datenquelle,
    führt EMA-State mit, evaluiert S4-Gate, schreibt in SharedMemory.

    Args:
        shm_name:      Name des SharedMemory-Segments
        stop_event:    multiprocessing.Event zum sauberen Shutdown
        m2_queue:      Queue zu p_m2 (nur PASS-Events werden weitergegeben)
        tick_interval: Sekunden pro Tick (default 1.0 Hz)
    """
    os.sched_setaffinity(0, CPU_M1_RANGE)
    proc_name = multiprocessing.current_process().name
    log = logging.getLogger(f'M1_OBSERVER')

    # SharedMemory öffnen
    try:
        shm = shared_memory.SharedMemory(name=shm_name)
    except FileNotFoundError:
        log.error(f"SharedMemory '{shm_name}' nicht gefunden — p_m1 beendet.")
        return

    state = S4SharedState.from_buffer(shm.buf)

    # EMA-State (nur in p_m1 — wird über SharedMemory persistiert)
    volume_ema_state: float = 0.0
    tick_counter: int = 0

    log.info(f"M1 Observer gestartet | Core={CPU_M1} | EMA_ALPHA={EMA_ALPHA:.6f} | "
             f"OB_THRESH={OB_DEPTH_THRESHOLD} | VOL_REQ={VOLUME_SPIKE_REQ}x")

    while not stop_event.is_set():
        tick_start = time.monotonic_ns()

        # ─── Daten lesen (in Produktion: aus gRPC-Shred-Stream oder UDP-Feed) ─
        # Hier: Simulierte Daten für Testzwecke
        current_volume, ob_depth = _read_market_data_stub()

        # ─── Numba AOT: S4-Gate berechnen ────────────────────────────────────
        new_ema, pass_to_m2, label_code, spike_mult = calculate_dynamic_s4_gate(
            current_volume=float(current_volume),
            previous_ema=volume_ema_state,
            ob_depth=int(ob_depth),
        )
        volume_ema_state = new_ema
        tick_counter += 1

        # ─── SharedMemory atomar aktualisieren (p_m1 = einziger Writer) ──────
        state.current_volume   = current_volume
        state.volume_ema       = volume_ema_state
        state.spike_multiplier = spike_mult
        state.ob_depth_levels  = int(ob_depth)
        state.s4_pass_flag     = int(pass_to_m2)
        state.s4_label_code    = int(label_code)
        state.tick_counter     = tick_counter
        state.timestamp_ns     = float(tick_start)

        # ─── PASS-Event an M2 Tensor weiterleiten ────────────────────────────
        if pass_to_m2:
            try:
                m2_queue.put_nowait({
                    'tick':            tick_counter,
                    'timestamp_ns':    tick_start,
                    'current_volume':  current_volume,
                    'volume_ema':      volume_ema_state,
                    'spike_multiplier': spike_mult,
                    'ob_depth':        ob_depth,
                    'label':           'MASSIVE_DUMP',
                    'label_code':      label_code,
                })
                log.info(
                    f"[T={tick_counter:06d}] S4 PASS → M2 | "
                    f"OB={ob_depth} Vol={current_volume:.2f} EMA={new_ema:.2f} "
                    f"Spike={spike_mult:.3f}x"
                )
            except Exception:
                pass  # Queue full — M2 zu langsam, Tick verwerfen

        elif label_code == LABEL_ILLIQUID:
            log.debug(
                f"[T={tick_counter:06d}] S4 REJECT ILLIQUID | "
                f"OB={ob_depth} Spike={spike_mult:.3f}x < {VOLUME_SPIKE_REQ}x"
            )
        elif label_code == LABEL_UNCERTAIN:
            log.debug(
                f"[T={tick_counter:06d}] S4 REJECT UNCERTAIN | OB={ob_depth} > {OB_DEPTH_THRESHOLD}"
            )

        # ─── Tick-Timing: Schlafen bis nächster 1-Hz-Slot ────────────────────
        elapsed = (time.monotonic_ns() - tick_start) / 1e9
        sleep_time = max(0.0, tick_interval - elapsed)
        if sleep_time > 0:
            time.sleep(sleep_time)

    log.info("M1 Observer: Stop-Signal empfangen — sauberes Shutdown.")
    del state   # ctypes-Referenz freigeben bevor SharedMemory geschlossen wird
    shm.close()


# ─── p_m2: M2 Tensor Prozess ──────────────────────────────────────────────────

def p_m2_tensor(
    shm_name: str,
    stop_event: Event,
    m2_queue: Queue,
    m3_queue: Queue,
) -> None:
    """
    M2 Tensor — Core 2
    Empfängt PASS-Events von M1, aggregiert Metriken, leitet an M3 weiter.
    Liest den 9-Metriken-Vektor aus SharedMemory (in Produktion via UDP-Feed).
    """
    os.sched_setaffinity(0, CPU_M2_RANGE)
    log = logging.getLogger('M2_TENSOR')

    try:
        shm = shared_memory.SharedMemory(name=shm_name)
    except FileNotFoundError:
        log.error(f"SharedMemory '{shm_name}' nicht gefunden.")
        return

    log.info(f"M2 Tensor gestartet | Cores={CPU_M2_RANGE}")

    while not stop_event.is_set():
        try:
            event = m2_queue.get(timeout=2.0)
        except Exception:
            continue

        # In Produktion: 9 Crash-Metriken aus Feature-Pipeline lesen
        # Hier: Stub-Werte
        metrics_stub = {
            'n': 0.88, 'PE': 0.22, 'kappa': 1.9, 'fragmentation': 0.79,
            'rt': 1.87, 'bValue': 0.72, 'CTE': 0.69, 'SSI': 7.1, 'LFI': 2.9,
        }

        m3_payload = {**event, 'metrics': metrics_stub}

        try:
            m3_queue.put_nowait(m3_payload)
            log.info(
                f"[T={event['tick']:06d}] M2→M3 | Spike={event['spike_multiplier']:.3f}x"
            )
        except Exception:
            log.warning(f"[T={event['tick']:06d}] M3-Queue voll — Event verworfen.")

    log.info("M2 Tensor: Stop-Signal empfangen.")
    shm.close()  # M2 liest nur, kein from_buffer → kein ctypes-Ref-Problem


# ─── p_m3: M3 Bayesian Decision Prozess ──────────────────────────────────────

def p_m3_decision(
    stop_event: Event,
    m3_queue: Queue,
    result_queue: Queue,
) -> None:
    """
    M3 Decision — Core 4
    Stub-Implementierung. In Produktion: ruft BayesianDecisionEngine auf,
    berechnet Posterior, entscheidet SHORT/MONITOR/IGNORE.
    """
    os.sched_setaffinity(0, {CPU_M3})
    log = logging.getLogger('M3_DECISION')
    log.info(f"M3 Decision gestartet | Core={CPU_M3}")

    while not stop_event.is_set():
        try:
            payload = m3_queue.get(timeout=2.0)
        except Exception:
            continue

        # Stub: Kriterium für IMMEDIATE_SHORT — in Produktion: Bayesian posterior >= 0.5
        crash_prob = _stub_crash_probability(payload['metrics'])
        action = 'IMMEDIATE_SHORT' if crash_prob >= 0.15 else 'MONITOR'

        result = {
            'tick':         payload['tick'],
            'action':       action,
            'crash_prob':   crash_prob,
            'spike':        payload['spike_multiplier'],
            'ob_depth':     payload['ob_depth'],
            's4_label':     payload['label'],
        }

        try:
            result_queue.put_nowait(result)
        except Exception:
            pass

        log.info(
            f"[T={payload['tick']:06d}] M3 → {action} | "
            f"P(crash)={crash_prob:.3f} Spike={payload['spike_multiplier']:.3f}x"
        )

    log.info("M3 Decision: Stop-Signal empfangen.")


# ─── p_ctl: Control Loop / Watchdog ──────────────────────────────────────────

def p_ctl_watchdog(
    processes: dict,
    stop_event: Event,
    check_interval: float = 5.0,
) -> None:
    """
    Control Loop — Core 6
    Überwacht alle Prozesse, startet abgestürzte neu.
    Beendet alle Prozesse wenn stop_event gesetzt wird.
    """
    os.sched_setaffinity(0, {CPU_CTL})
    log = logging.getLogger('CTL_WATCHDOG')
    log.info(f"Control Loop gestartet | Core={CPU_CTL} | Interval={check_interval}s")

    while not stop_event.is_set():
        for name, proc in processes.items():
            if not proc.is_alive():
                log.error(f"Prozess {name} (PID={proc.pid}) tot — EXIT_CODE={proc.exitcode}")
                # In Produktion: Neustart des Prozesses hier
        time.sleep(check_interval)

    log.info("CTL Watchdog: Stop-Signal empfangen — alle Prozesse beenden.")
    for name, proc in processes.items():
        if proc.is_alive():
            proc.terminate()
            proc.join(timeout=3.0)
            log.info(f"{name} beendet.")


# ─── Stub-Funktionen (in Produktion durch echte Datenquellen ersetzen) ────────

def _read_market_data_stub() -> tuple:
    """
    Stub: Liest current_volume und ob_depth aus simulierter Quelle.
    In Produktion: UDP-Feed von Node A / gRPC Shred-Stream.
    Gibt einen zufälligen Wert zurück der gelegentlich S4-Gate triggert.
    """
    import random
    # Simuliert: 95% der Zeit normaler Markt, 5% S4-relevantes Muster
    r = random.random()
    if r < 0.03:
        # S4-Pass-Szenario: flaches Buch + toxisches Volumen
        return random.uniform(8_000, 15_000), random.randint(1, 3)
    elif r < 0.08:
        # ILLIQUID: flaches Buch + normales Volumen
        return random.uniform(800, 2_500), random.randint(1, 3)
    else:
        # Normaler Markt
        return random.uniform(1_000, 5_000), random.randint(5, 20)


def _stub_crash_probability(metrics: dict) -> float:
    """
    Stub: Bayesian posterior aus Metrik-Vektor.
    In Produktion: vollständige BayesianDecisionEngine aus bayesian-decision-engine.ts.
    """
    danger_count = sum([
        metrics.get('n', 0) > 0.8,
        metrics.get('PE', 1) < 0.35,
        metrics.get('kappa', 5) < 3.0,
        metrics.get('fragmentation', 0) > 0.7,
        metrics.get('rt', 0) > 1.2,
        metrics.get('bValue', 2) < 1.0,
        metrics.get('CTE', 0) > 0.6,
        metrics.get('SSI', 0) > 5.0,
        metrics.get('LFI', 0) > 2.0,
    ])
    return danger_count / 9.0


# ─── Haupt-Entry-Point ────────────────────────────────────────────────────────

def main(validation_gate_status: str = 'BLOCKED') -> None:
    """
    Haupt-Entry-Point für die Multi-Process Architektur.

    WICHTIG: Wird nur gestartet wenn validation_gate_status == 'VALIDATED'.
    Das Gate wird durch den TypeScript review-runner bestimmt und extern übergeben.

    Args:
        validation_gate_status: 'VALIDATED' | 'BLOCKED' | 'DEGRADED'
    """
    if validation_gate_status != 'VALIDATED':
        logger.error(
            f"START ABGELEHNT: ValidationGate = '{validation_gate_status}'. "
            f"Bedingungen: criticalCellCount(MD↔ILLIQUID) == 0 UND KAS-Score >= 0.85. "
            f"Runde-2-Review abschließen bevor dieser Prozess gestartet wird."
        )
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("TRINITY APEX MAIN MP — VALIDIERTER START")
    logger.info(f"ValidationGate: {validation_gate_status}")
    logger.info(f"CPU-Affinität: p_m1 Cores {CPU_M1_RANGE}, p_m2 Cores {CPU_M2_RANGE}, p_m3 Core {CPU_M3}, p_ctl Core {CPU_CTL}")
    logger.info("Core 0: RESERVIERT FÜR LINUX-KERNEL + NIC")
    logger.info(f"Python: {sys.version}")
    logger.info(f"NumPy: {np.__version__}")
    logger.info(f"CPUs verfügbar: {cpu_count()}")
    logger.info("=" * 60)

    # ─── SharedMemory initialisieren ──────────────────────────────────────────
    try:
        shm = shared_memory.SharedMemory(name=SHM_NAME, create=True, size=SHM_SIZE)
        logger.info(f"SharedMemory '{SHM_NAME}' erstellt ({SHM_SIZE} bytes)")
    except FileExistsError:
        shm = shared_memory.SharedMemory(name=SHM_NAME, create=False, size=SHM_SIZE)
        logger.warning(f"SharedMemory '{SHM_NAME}' existiert bereits — wiederverwende.")

    # Initialen Zustand setzen
    state = S4SharedState.from_buffer(shm.buf)
    state.validation_gate_ok = 1
    state.tick_counter = 0

    # ─── Numba JIT warmen (Erster Aufruf kompiliert) ─────────────────────────
    logger.info("Numba JIT: Erster Compile-Lauf (einmalig)...")
    _ = calculate_dynamic_s4_gate(1000.0, 800.0, 5)
    logger.info("Numba JIT: Kompiliert und gecacht.")

    # ─── Prozess-Kommunikation ────────────────────────────────────────────────
    stop_event = Event()
    m2_queue   = Queue(maxsize=100)
    m3_queue   = Queue(maxsize=100)
    result_queue = Queue(maxsize=500)

    # ─── Prozesse starten ────────────────────────────────────────────────────
    proc_m1 = multiprocessing.Process(
        target=p_m1_observer,
        args=(SHM_NAME, stop_event, m2_queue),
        name='p_m1',
        daemon=True,
    )
    proc_m2 = multiprocessing.Process(
        target=p_m2_tensor,
        args=(SHM_NAME, stop_event, m2_queue, m3_queue),
        name='p_m2',
        daemon=True,
    )
    proc_m3 = multiprocessing.Process(
        target=p_m3_decision,
        args=(stop_event, m3_queue, result_queue),
        name='p_m3',
        daemon=True,
    )

    processes = {'p_m1': proc_m1, 'p_m2': proc_m2, 'p_m3': proc_m3}

    for name, proc in processes.items():
        proc.start()
        logger.info(f"{name} gestartet | PID={proc.pid}")

    # ─── Control Loop (Hauptprozess) ──────────────────────────────────────────
    try:
        p_ctl_watchdog(processes, stop_event, check_interval=5.0)
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt — sauberes Shutdown einleiten.")
        stop_event.set()
        for name, proc in processes.items():
            proc.join(timeout=5.0)
        logger.info("Alle Prozesse beendet.")
    finally:
        del state   # ctypes-Referenz freigeben
        shm.close()
        try:
            shm.unlink()
            logger.info(f"SharedMemory '{SHM_NAME}' freigegeben.")
        except Exception:
            pass


if __name__ == '__main__':
    # In Produktion: validation_gate_status aus dem TypeScript-Runner lesen
    # oder als Umgebungsvariable setzen:
    #   VALIDATION_GATE=VALIDATED python3 trinity_apex_main_mp.py
    gate_status = os.environ.get('VALIDATION_GATE', 'BLOCKED')
    main(validation_gate_status=gate_status)
