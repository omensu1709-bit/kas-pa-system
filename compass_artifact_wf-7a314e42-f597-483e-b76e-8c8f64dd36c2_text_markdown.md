# Helius LaserStream vs Chainstack Yellowstone gRPC: the definitive comparison

**Helius LaserStream and Chainstack Yellowstone gRPC both stream identical Solana data types but diverge dramatically on scale limits, resilience features, and cost — making them complementary rather than competing.** LaserStream supports up to **10 million monitored accounts** with automatic 24-hour replay and multi-region failover, while Chainstack caps at **50 accounts per stream** but costs just **$98/month** versus Helius's **$499+/month** minimum for mainnet access. Critically, the Helius Developer Plan ($49/month) provides LaserStream on **devnet only** — mainnet gRPC streaming requires the Business plan. Both services include ShredStream-level ingestion, and raw shred streaming is unnecessary for crash detection systems where events unfold over minutes rather than milliseconds. The optimal architecture uses LaserStream as the primary stream for its replay/failover guarantees and Chainstack as an affordable redundancy layer.

---

## Both services stream all seven Yellowstone data types — with identical filtering

A common misconception is that these services offer different data. They don't. Both implement the full Yellowstone gRPC (Dragon's Mouth) protocol, streaming all seven data types defined by the Geyser plugin specification:

| Data Type | Helius LaserStream | Chainstack Yellowstone | Filters Available |
|---|---|---|---|
| **Accounts** | ✅ | ✅ | pubkey, owner, memcmp, dataSize, data_slice |
| **Transactions** | ✅ | ✅ | accountInclude/Exclude/Required, vote, failed, signature |
| **Transaction Status** | ✅ | ✅ | Lightweight confirm/fail only |
| **Slots** | ✅ | ✅ | filterByCommitment |
| **Blocks** | ✅ | ✅ | accountInclude, includeTransactions/Accounts/Entries |
| **Blocks Meta** | ✅ | ✅ | None — all broadcast |
| **Entries** | ✅ | ✅ | None — all broadcast |

Both services support all three commitment levels (**processed**, **confirmed**, **finalized**), can **exclude vote transactions** (`vote: false` removes ~70% of Solana traffic), and can **exclude failed transactions** (`failed: false`). The `accounts_data_slice` parameter works on both, allowing you to receive only specific byte ranges of account data to reduce bandwidth. The filtering parity means the differentiation lies entirely in operational characteristics, not data availability.

---

## Where LaserStream dominates: scale, resilience, and developer experience

The gap between these services is not in *what* they stream but in *how well* they handle production demands. LaserStream's architecture was purpose-built for mission-critical Solana applications and it shows across every operational dimension.

**Account monitoring scale is the most dramatic difference.** LaserStream supports up to **10 million account subscriptions** per stream with **unlimited program filters**. Chainstack limits each stream to **50 accounts** and allows a maximum of **5 concurrent filters of the same type** per connection. For a crash detection system monitoring hundreds of whale wallets, vault accounts, and LP pool addresses, this 200,000x difference in account capacity is decisive. Chainstack's limit means you'd need to spread monitoring across multiple streams — at 50 accounts each with the $149/month plan for 5 streams, you could monitor only 250 accounts total.

**The 24-hour historical replay** is LaserStream's second killer feature. When a client reconnects after a disconnection, it can specify a `fromSlot` parameter to replay up to **216,000 slots** (~24 hours) of missed data. The LaserStream SDK tracks the last processed slot automatically and resumes from that exact point, guaranteeing zero data gaps. Chainstack supports a `from_slot` parameter but its replay window is **not publicly documented** and is likely limited to whatever the server-side configuration provides — significantly less than 24 hours.

**Auto-reconnection with failover** is built into all LaserStream SDKs (JavaScript, Rust, Go). The service operates across **9 global regions** (Newark, Pittsburgh, Salt Lake City, Los Angeles, London, Amsterdam, Frankfurt, Tokyo, Singapore) with automatic region failover when servers go down. Chainstack offers multi-cloud redundancy but does not provide built-in auto-reconnect for gRPC streams — this must be implemented client-side.

**SDK performance** further separates the two. LaserStream's JavaScript SDK uses Rust core with NAPI bindings, achieving **1.3 GB/s throughput** — roughly **40x faster** than the standard Yellowstone gRPC JavaScript client at 30 MB/s. The SDK also supports **Zstd compression** for 70–80% bandwidth reduction and **Stream Write** for updating subscriptions without reconnecting. Chainstack uses the standard `@triton-one/yellowstone-grpc` client library.

| Feature | Helius LaserStream | Chainstack Yellowstone |
|---|---|---|
| Max accounts per stream | **10,000,000** | **50** |
| Historical replay window | **24 hours (216,000 slots)** | Not documented |
| Auto-reconnect | **Built into SDK** | Manual implementation |
| Multi-region failover | **9 regions, automatic** | Multi-cloud, manual |
| JS SDK throughput | **1.3 GB/s** | ~30 MB/s (standard client) |
| Dynamic subscription updates | **Stream Write** | Requires reconnection |
| Concurrent gRPC connections | **10 (Business), 100 (Professional)** | **1/5/25 streams by tier** |
| Blocked accounts | None documented | TokenkegQ..., kinXdEcpD... |

---

## Chainstack's advantage is economics and simplicity

Where Chainstack wins decisively is **cost efficiency**. The total minimum for gRPC access is **$98/month** (Growth plan $49 + gRPC add-on $49), providing 1 concurrent stream with unlimited events and Jito ShredStream enabled by default. Helius requires the **Business plan at $499/month** for mainnet LaserStream plus **data add-ons starting at $400/month** for 5TB — a minimum of **$899/month** for production use.

Chainstack's **flat-fee, unlimited events model** is particularly attractive for unpredictable workloads. There are no per-megabyte charges — you pay for streams and account slots, not data volume. Helius charges **20 credits per 1MB** of streamed data (as of April 7, 2026), which can create significant cost variability when monitoring high-activity accounts or during market volatility spikes. At the base credit rate, Helius's effective cost is approximately **$100/TB** on the base plan, dropping to **$60–80/TB** with data add-ons.

Chainstack also has **Jito ShredStream enabled by default** on all Solana nodes at no additional cost. Their benchmarks show **37% more slots in the optimal timing window** and **3x fewer missed slots** with ShredStream. This means Chainstack's gRPC data already benefits from shred-level propagation acceleration, narrowing the latency gap with LaserStream.

| Tier | Helius | Chainstack |
|---|---|---|
| **Minimum for mainnet gRPC** | $499/mo (Business) + $400/mo (5TB data) = **$899/mo** | $49/mo (Growth) + $49/mo (gRPC) = **$98/mo** |
| **Mid-tier** | $999/mo (Professional) + $750/mo (10TB) = **$1,749/mo** | $49/mo + $149/mo (5 streams) = **$198/mo** |
| **High-throughput** | Professional + $1,750/mo (25TB) = **$2,749/mo** | $199/mo (Pro) + $449/mo (25 streams) = **$648/mo** |
| **Dedicated nodes** | From **$2,900/mo** | From **~$3,577/mo** |

---

## Shred Stream is irrelevant for crash detection — here's why

Previous research referenced a "400ms advantage" for ShredStream. This is real but misleading for crash detection. The 400ms figure represents **Solana's block time boundary** — shreds deliver transaction data within the current ~400ms slot rather than waiting for the next slot. Independent benchmarks by Dysnix measured the average advantage at **32ms** over standard Yellowstone gRPC, with a maximum gain of **1.3 seconds** across 2+ million matched transactions.

**Raw shred streams provide transaction intent, not execution outcomes.** Shreds contain instructions and account keys but lack the execution metadata that crash detection requires: balance changes, success/failure status, inner instructions, compute units consumed, and post-execution account states. You cannot determine if a vault was actually drained, if a whale's sell order succeeded, or if a liquidity removal completed — only that someone attempted these actions.

For a 9-metric crash detection system where token crashes unfold over **minutes to hours**, the 32ms average advantage is negligible (less than 0.001% of a 1-hour detection window). The **data richness of Yellowstone gRPC** — confirmed account states, transaction outcomes, balance deltas — is far more valuable than the latency advantage of raw shreds. Both LaserStream and Chainstack already incorporate ShredStream-accelerated propagation into their gRPC pipelines, so you get the propagation benefit without the engineering complexity of handling raw shreds.

---

## Mapping the 9 crash detection metrics to optimal data sources

Each metric in the crash detection framework maps to specific Yellowstone data types. The critical question is which provider handles each metric best given subscription limits, latency, and cost.

**Vault balance monitoring (Metrics 3, 5, 9)** requires account subscriptions on specific vault pubkeys. These are high-criticality, low-bandwidth streams — a few dozen accounts generating updates only when balances change. LaserStream is optimal here because its **24-hour replay guarantees zero gaps** in balance tracking. With Chainstack's 50-account limit, vault monitoring fits comfortably, making it viable as a redundant backup for these critical accounts.

**Holder network construction (Metrics 1, 2, 7)** requires transaction streaming filtered by token mint or program accounts. This is high-bandwidth work — every transfer involving the token generates a transaction event. Chainstack's **unlimited events** model makes it cost-effective for this volume. LaserStream handles it too but at higher bandwidth cost. The optimal split: use both providers for this data type, with Chainstack handling the bulk volume and LaserStream providing the redundant, replay-protected stream.

**Transaction entropy analysis (Metric 3)** needs broad transaction pattern data across multiple programs (token program, DEX programs, AMMs). This generates the highest data volume. Chainstack's flat-fee model is better suited for unpredictable transaction volumes during market turbulence.

**Whale account monitoring (Metric 8)** requires subscribing to large holder accounts — potentially hundreds of wallets. LaserStream's 10-million-account capacity handles this effortlessly. Chainstack's 50-account limit per stream means you'd need at least 3-5 streams at the $149/month tier to monitor 150-250 whale wallets, or use program-level filters with `owner` to catch all token accounts under the SPL Token Program, then filter client-side.

| Crash Detection Metric | Primary Data Type | Recommended Primary | Recommended Backup | Rationale |
|---|---|---|---|---|
| Holder concentration (1) | Transactions | Chainstack | LaserStream | High volume, flat-fee benefits |
| Distribution velocity (2) | Transactions | Chainstack | LaserStream | High volume, cost-effective |
| Transaction entropy (3) | Transactions | Chainstack | LaserStream | Broadest pattern capture |
| Vault balance delta (5) | Accounts | **LaserStream** | Chainstack | 24-hour replay critical |
| Whale flow analysis (7) | Transactions + Accounts | Both | — | Complementary roles |
| Whale position tracking (8) | Accounts | **LaserStream** | Chainstack | Scale (hundreds of accounts) |
| Reserve integrity (9) | Accounts | **LaserStream** | Chainstack | Zero-gap guarantee essential |

---

## The optimal dual-stream architecture: hybrid with specialized roles

The recommended configuration uses **LaserStream as the primary stream** for all account monitoring and critical transaction feeds, with **Chainstack as a secondary/supplementary stream** providing redundancy for critical accounts and bulk transaction volume for entropy analysis.

**Architecture overview:**

```
┌─────────────────────┐     ┌──────────────────────┐
│  Helius LaserStream  │     │  Chainstack Yellowstone│
│  (PRIMARY)           │     │  (SECONDARY)           │
│                      │     │                        │
│  • All vault accounts│     │  • Same vault accounts │
│  • Whale wallets     │     │    (redundancy)        │
│  • LP pool accounts  │     │  • DEX transactions    │
│  • Token transfers   │     │    (entropy analysis)  │
│  • Mint authority    │     │  • Broad program txns  │
│  • Slot health       │     │  • Slot health         │
└──────────┬──────────┘     └──────────┬─────────────┘
           │                           │
           ▼                           ▼
    ┌──────────────────────────────────────┐
    │     Deduplication Layer              │
    │  Key: (signature + slot) for txns   │
    │  Key: (pubkey + slot + writeVersion)│
    │       for account updates           │
    │  30-second sliding window Map       │
    └──────────────┬───────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────────┐
    │   Unified Event Pipeline             │
    │  Slot-ordered, deduplicated          │
    │  First-arrival-wins in normal mode   │
    └──────────────┬───────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────────────┐
    │   9-Metric Crash Detection Engine    │
    └──────────────────────────────────────┘
```

**Deduplication uses composite keys.** For transactions, the globally unique signature plus slot number serves as the dedup key. For account updates, use `(account_pubkey, slot, write_version)` as the composite key. A time-windowed Map with a 30-second TTL and a cap of ~100,000 entries handles this efficiently with O(1) lookups. The open-source `yellowstone-grpc-kafka` project by Triton provides a production-tested reference for this pattern.

**Failover operates in active-active mode.** Both streams run simultaneously — first arrival wins after deduplication. This provides the lowest possible latency since you always get data from whichever provider delivers first. Health monitoring compares incoming slot numbers between providers; if one falls >5 slots behind, it's flagged as lagging. If no messages arrive for >10 seconds, it's marked as disconnected. When LaserStream recovers from a disconnection, its 24-hour replay automatically backfills any missed data. Chainstack recovery depends on client-side `from_slot` implementation.

**Use slot numbers as the canonical time axis**, not wall-clock timestamps. Both providers read from the same Solana cluster and report the same slot numbers, making slot the natural synchronization point across streams. Within a single slot, use `write_version` for account update ordering and transaction index for transaction ordering. Note that **neither provider guarantees message ordering** — buffering and client-side sorting by (slot, index) is required for both.

---

## Cost analysis: $98/month Chainstack alone is sufficient for basic monitoring, but LaserStream adds critical resilience

**Chainstack at $98/month** (Growth + 1 gRPC stream) provides everything needed for a proof-of-concept crash detection system: all 7 data types, vote/failed transaction filtering, ShredStream-accelerated delivery, and sub-50ms streaming latency. The 50-account limit constrains monitoring to ~50 specific addresses per stream, but creative use of `owner` filters (program-level subscription) can capture all token accounts under a program, expanding effective coverage significantly.

**LaserStream at $899+/month** (Business plan + 5TB data add-on) adds three capabilities that justify the cost for production systems: **24-hour replay** eliminates data gaps during outages (critical for metrics requiring continuous balance tracking), **10-million-account capacity** supports comprehensive whale monitoring without workarounds, and **automatic multi-region failover** provides infrastructure-level resilience that would cost thousands to build independently.

**Running both costs approximately $1,000–1,100/month** ($899 Helius + $98–198 Chainstack). This is justified when the financial cost of a missed crash detection exceeds the monthly service cost — if your system protects portfolios where a 30-second detection delay could mean losses exceeding $5,000+/month, the dual-stream insurance pays for itself. The probability of simultaneous outage across both independent providers approaches **99.9999% combined availability**, compared to **99.99%** for either alone.

**Could one service be eliminated?** If forced to choose one: **LaserStream for production** (replay, scale, failover) or **Chainstack for development and cost-constrained deployments** (10x cheaper, identical data types). The 50-account Chainstack limit is the binding constraint — if your crash detection system monitors fewer than 50 specific addresses plus uses program-level filters for broader coverage, Chainstack alone may suffice. But for comprehensive whale tracking across hundreds of accounts, LaserStream's capacity is necessary.

---

## Conclusion: complementary services, not competitors

The optimal strategy is not choosing between these services but **assigning them specialized roles**. LaserStream's 24-hour replay, 10-million-account capacity, and automatic failover make it the only viable primary for production crash detection where data continuity is non-negotiable. Chainstack's flat-fee unlimited events model and $98/month entry point make it the ideal secondary stream for redundancy and high-volume transaction analysis where cost predictability matters.

Three key insights emerge from this analysis that weren't obvious from surface-level documentation. First, the **Helius Developer Plan is a devnet-only trap** — mainnet LaserStream requires the Business plan at 10x the cost, fundamentally changing the economics. Second, **both services already include ShredStream acceleration**, making dedicated shred stream access unnecessary for any use case except sub-millisecond HFT. Third, the **50-account limit on Chainstack** is not as restrictive as it appears: program-level `owner` filters can monitor all accounts belonging to a program (like all token accounts for a specific mint) without consuming account slots, enabling broad coverage within the constraint.

For the 9-metric crash detection system specifically, the recommended starting configuration is Chainstack alone at $98/month for development and validation, scaling to LaserStream + Chainstack ($~1,100/month) for production deployment once the system proves its detection accuracy warrants the investment in zero-gap data continuity.