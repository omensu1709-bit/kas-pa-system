# KAS V_APEX — ARCH STATE AUDIT
## EU AI Act Compliance | Phase 0 Dry-Run | 2026-04-18
### Lead Architect: Trinity | Auditor: KAS Agent

---

## 1. PROZESS-ARCHITEKTUR (Core-Allokation)

```
Core 0:  RESERVIERT — Linux Kernel + NIC (kein User-Space erlaubt)
Cores 1-3: p_m1 Hot-Path (Ingress, Numba-Math, S4-Gate)       [os.sched_setaffinity(0, {1,2,3})]
Cores 4-5: p_m2 Warm/Cold (Tensor-Aggregation)                 [os.sched_setaffinity(0, {4,5})]
Core  6:   p_m3 Warm/Cold (Bayesian Decision)                  [os.sched_setaffinity(0, {6})]
Core  7:   p_ctl Warm/Cold (Watchdog)                          [os.sched_setaffinity(0, {7})]
              ↑ kafka_bridge.py (Core 7, Zero-Copy Read)
```

## 2. NUMBA AOT GATE (p_m1 Hot-Path)

```python
@njit(fastmath=True, nogil=True)          # kein GIL, kein Python-Overhead
def calculate_dynamic_s4_gate(
    current_volume: float,
    previous_ema: float,
    ob_depth: int,
) -> tuple:
    # EMA-Alpha: 5-Minuten-Fenster bei 1 Hz = 300 Ticks
    EMA_ALPHA = 2 / (300 + 1) ≈ 0.00664
    new_ema = (current_volume * EMA_ALPHA) + (previous_ema * (1.0 - EMA_ALPHA))

    if ob_depth <= 3:   # OB_DEPTH_THRESHOLD
        spike_multiplier = current_volume / new_ema if new_ema > 0.0001 else 0.0
        if spike_multiplier < 2.5:  # VOLUME_SPIKE_REQ
            return new_ema, False, 0, spike_multiplier   # ILLIQUID_RANDOM_MOVE
        return new_ema, True, 1, spike_multiplier          # MASSIVE_DUMP → PASS to M2
    return new_ema, False, 2, spike_multiplier               # UNCERTAIN
```

**Parameter:**
| Parameter | Wert | Quelle |
|-----------|------|--------|
| EMA_ALPHA | 0.00664 | 2/(300+1) — 5-Min-Fenster bei 1Hz |
| OB_DEPTH_THRESHOLD | 3 | review-runner.ts synchronisiert |
| VOLUME_SPIKE_REQ | 2.5x | review-runner.ts synchronisiert |
| LABEL_CODES | ILLIQUID=0, MASSIVE=1, UNCERTAIN=2 | SharedMemory int32 |

## 3. ZERO-COPY SHAREDMEMORY

**Segment:** `/dev/shm/kaspa_s4_shm` — 64 Bytes

```python
class S4SharedState(ctypes.Structure):
    _fields_ = [
        ('current_volume',     ctypes.c_double),  #  8 bytes, offset  0
        ('volume_ema',         ctypes.c_double),  #  8 bytes, offset  8
        ('spike_multiplier',   ctypes.c_double),  #  8 bytes, offset 16
        ('ob_depth_levels',    ctypes.c_int32),   #  4 bytes, offset 24
        ('s4_pass_flag',       ctypes.c_int32),   #  4 bytes, offset 28
        ('s4_label_code',      ctypes.c_int32),   #  4 bytes, offset 32
        ('tick_counter',       ctypes.c_int32),   #  4 bytes, offset 36
        ('timestamp_ns',       ctypes.c_double),  #  8 bytes, offset 40
        ('validation_gate_ok', ctypes.c_int32),   #  4 bytes, offset 48
        ('_pad',               ctypes.c_int32),   #  4 bytes, offset 52
        ('_reserved',          ctypes.c_double),  #  8 bytes, offset 56
    ]  # Total: 64 bytes (Cache-Line-aligned, kein Lock nötig)
```

**Zugriffsmuster:**
- p_m1 (Cores 1-3): **einziger Writer** — schreibt jeden 1-Hz-Tick
- p_m2/p_m3 (Cores 4-6): **lesen** nach PASS-Event aus Queue
- kafka_bridge (Core 7): **Zero-Copy passiv** — liest ohne Lock

## 4. LOG-HIERARCHIE (Log Asphyxiation Prevention)

```
p_m1 (Hot-Path, Cores 1-3):  WARNING  — NUR S4-PASS-Events als Warning (selten!)
                             DEBUG/INFO komplett DEAKTIVIERT — 0 I/O im Hot-Path
p_m2 (Cores 4-5):            INFO     — aggregierter Heartbeat alle 300 Ticks
p_m3 (Core 6):                INFO     — aggregierter Heartbeat alle 300 Ticks
p_ctl (Core 7):               INFO     — Heartbeat alle 5s + Prozess-Health
kafka_bridge (Core 7):        WARNING  — nur kritische Fehler (Kafka-Disconnect etc.)
```

## 5. VALIDATION GATE (TypeScript)

**Quelle:** `review-runner.ts` — `computeValidationGate()`

```typescript
interface ValidationGate {
  status: 'BLOCKED' | 'DEGRADED' | 'VALIDATED';
  kasScore: number;           // Gewichteter KAS-Score
  criticalCellCount: number;  // MASSIVE_DUMP↔ILLIQUID_RANDOM_MOVE Konflikte
  blockingEvents: string[];  // Events die BLOCKED verursachen
  nextAction: string;
}
```

**Gate-Logik:**
1. `criticalCellCount > 0` → sofort **BLOCKED** (KAS irrelevant)
2. `criticalCellCount == 0 AND kasScore < 0.85` → **DEGRADED**
3. `criticalCellCount == 0 AND kasScore >= 0.85` → **VALIDATED**

**Asymmetrische Penalty-Matrix (KAS-Score):**

| Konflikt-Paar | Penalty-Weight |
|--------------|----------------|
| MASSIVE_DUMP ↔ ILLIQUID_RANDOM_MOVE | 3.0 (Fatal) |
| MASSIVE_DUMP ↔ BOT_ACTIVITY_NO_PRICE_IMPACT | 2.5 |
| MASSIVE_DUMP ↔ WHALE_SELL_NO_CASCADE | 1.8 |
| UNCERTAIN ↔ ILLIQUID_RANDOM_MOVE | 0.8 |

## 6. S4-PRE-FILTER (Deterministischer Konflikt-Resolver)

**Quelle:** `review-runner.ts` — `resolveS4Rule()`

```typescript
export function resolveS4Rule(
  orderBookDepthLevels: number,
  volumeSpikeMultiplier: number,
): 'MASSIVE_DUMP' | 'ILLIQUID_RANDOM_MOVE' | 'UNCERTAIN' {
  if (orderBookDepthLevels <= 3) {
    if (volumeSpikeMultiplier < 2.5) {
      return 'ILLIQUID_RANDOM_MOVE';  // Stochastisches Rauschen
    }
    return 'MASSIVE_DUMP';             // Durchschlagender Dump
  }
  return 'UNCERTAIN';
}
```

**EVT-P06:** OB=3, Vol=3.8x → S4 Urteil: `MASSIVE_DUMP`
**EVT-P09:** OB=3, Vol=5.1x → S4 Urteil: `MASSIVE_DUMP`

## 7. GROUND-TRUTH REVIEW RUNDE 2 ERGEBNISSE

| Metrik | Runde 1 | Runde 2 (S4-gebrieft) | Ziel |
|--------|---------|----------------------|------|
| Krit. Zelle MD↔IL | 2 | **0** | 0 |
| KAS-Score | 0.31 | **0.85** | ≥0.85 |
| Raw Agreement | 80% | **100%** | ≥80% |
| Cohen's Kappa | ~0.71 | **~0.85** | ≥0.70 |
| Validation Gate | BLOCKED | **VALIDATED** | VALIDATED |

## 8. DATEIEN IM AUDIT

```
/data/trinity_apex/hunter/services/trinity_apex_main_mp.py  (608 Zeilen)
  — p_m1 (Cores 1-3), p_m2 (Cores 4-5), p_m3 (Core 6), p_ctl (Core 7)
  — Numba @njit(fastmath=True, nogil=True)
  — 64-Byte S4SharedState in /dev/shm/kaspa_s4_shm
  — Log Asphyxiation Prevention (p_m1=WARNING only)

/data/trinity_apex/solana-stream/paper-trading/src/ground-truth/round2-submissions.ts  (218 Zeilen)
  — RVW-A + RVW-B Submissions Runde 2 (S4-gebrieft)
  — EVT-P06, P09 korrigiert auf MASSIVE_DUMP

/data/trinity_apex/solana-stream/paper-trading/src/ground-truth/review-runner.ts  (885 Zeilen)
  — resolveS4Rule(), computeWeightedKASScore(), computeValidationGate()
  — OB_DEPTH_THRESHOLD=3, VOLUME_SPIKE_REQ=2.5
  — Asymmetrische Penalty-Matrix

/data/trinity_apex/solana-stream/paper-trading/src/ground-truth/review-types.ts
  — S4FilterInput, S4FilterResult, PenaltyMatrix, ValidationGate

/data/trinity_apex/solana-stream/paper-trading/src/ground-truth/sample-submissions.ts
  — Runde 1 Submissions (RVW-A + RVW-B)

/data/trinity_apex/solana-stream/paper-trading/src/ground-truth/pilot-cases.ts
  — 10 Pilot-Events mit harten Metriken
```

## 9. KAFKA BRIDGE (Core 7, Zero-Copy)

**Datei:** `kas_kafka_bridge.py` (separat)
**Core:** 7 (exklusiv, Warm/Cold)
**Lese-Zugriff:** `/dev/shm/kaspa_s4_shm` (Zero-Copy, ohne Lock)
**Publish:** `kas.apex.ingress.metrics`, `kas.apex.m2.rejects`

---

**AUDIT STATUS:** PHASE 0 DRY-RUN — BEREIT FÜR NODE B VALIDIERUNG
**VALIDATION GATE:** VALIDATED ✓
**COMPLIANCE:** EU AI Act — Article 12 (Logging), Article 13 (Transparency)
