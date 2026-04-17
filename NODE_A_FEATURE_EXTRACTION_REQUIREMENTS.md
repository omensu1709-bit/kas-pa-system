# NODE B → NODE A: Feature Extraction Architecture Requirements
## Date: 2026-04-08 | Status: PENDING Chainstack Resolution

---

## 1. CRITICAL INFORMATION REQUIRED

### CODE FILES NEEDED
- `core2_hotpath_extractor.py` - Complete Source Code
  - All Feature Calculation Functions
  - `sig_short_prob` Algorithm (Index 34)
  - `sig_confidence` Calculation (Index 35)
  - `vpin_raw`, `vpin_ma5`, `vpin_ma20`, `vpin_std` Formulas
  - MEV-Jito Feature Logic (21-23)
  - Bot Activity Detection (30-32)

### ARCHITECTURE
- Feature Pipeline: gRPC → Parsing → Feature Extraction → UDP
- Computational Complexity per Feature
- CPU Affinity Settings (Core 2 exclusive?)
- Memory Footprint (Buffer Sizes)

### DATA FLOW
- Real-time vs. Batch Processing
- Feature Update Frequency (per transaction? per slot?)
- Error Handling (NaN/Inf validation)
- Sequence Integrity (monotonic timestamps)

---

## 2. SPECIFIC QUESTIONS

### 2.1 Feature Interdependencies
- How do `sig_short_prob` and `sig_confidence` relate?
- Which Features are inputs for `sig_short_prob`?
- Feature Weights? (VPIN 40%, OFI Anatomy 30%, Liquidity 20%, etc.)

### 2.2 MEV-Jito Implementation
- Do you calculate `mev_jito_tip_amount` from Jito Auction Data?
- How do you distinguish legitimate Tips vs. MEV Tips?
- How do you correlate Jito Tips with Sandwich Attacks?

### 2.3 Bot Activity Detection
- How do you detect `bot_density`, `bot_volume`, `bot_similarity`?
- Clustering Algorithm? (DBSCAN, k-means, graph-based)
- Realtime vs. Historical Bot Detection?

### 2.4 Temporal Patterns
- Do you calculate Volume Acceleration (`vol_1m` vs `vol_5m` gradient)?
- Regime Change Detection (HMM implementation)?
- Flash Crash Signature Recognition?

---

## 3. PERFORMANCE METRICS

### Current Performance
- Feature Extraction/slot?
- Latency: gRPC receive → Feature ready (ms)
- CPU Utilization Core 2 (%)
- Memory Usage (/dev/shm size)
- UDP Transmission Rate (packets/sec)

### Bottlenecks
1. gRPC Deserialization?
2. Feature Computation?
3. SHM Write?
4. UDP Send?

---

## 4. OPTIMIZATION POTENTIAL

### For 11/10 Integration
- Which Features could be parallelized?
- Which could benefit from Python → Rust/Cython?
- GPU Acceleration possible? (CUDA/OpenCL)
- Feature Compression (lossless vs. lossy)?

---

## 5. VALIDATION DATA

### Training/Validation Sets
- Historical Features + Outcomes (3% drops)
- Feature Importance Scores (SHAP/LIME)
- Correlation Matrix (40×40)
- Temporal Stability Metrics

### Ground Truth
- How do you validate `sig_short_prob` against real 3% drops?
- False Positive Rate?
- Lead Time Distribution?

---

## 6. CO-DESIGN REQUIREMENTS

### For Node B Integration
- Preferred UDP Packet Format Changes?
- Additional Features needed by Node B?
- Real-time Feedback Loop (Node B → Node A)?
- Health Monitoring Protocol?

### Shared Memory Optimization
- Current SHM Ring Buffer Size?
- Producer/Consumer Sync Mechanism?
- Crash Recovery Strategy?

---

## 7. CRITICAL CONSTANTS

### Please Provide:
1. All Threshold Values (VPIN > 0.6, OFI < -0.5, etc.)
2. EMA Alpha Values (BRIER_EMA_ALPHA = 0.1, etc.)
3. Normalization Ranges (0-1, -∞ to +∞)
4. Magic Numbers/Heuristics

---

## 8. CHAINSTACK STATUS

**BLOCKER:** RESOURCE_EXHAUSTED - Waiting for Support Response

Once Chainstack resolves the stream limit issue, Node A can resume normal operations and provide this information.

---

## ANSWER FORMAT

Please respond with:
1. Complete `core2_hotpath_extractor.py` source code
2. Detailed answers to Section 2 questions
3. Current performance metrics from actual system
4. List of all threshold constants
