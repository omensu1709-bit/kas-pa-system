# TRINITY V_APEX: MASTER RECONSTRUCTION SNAPSHOT [MRS-01]
Datum: 2026-02-21 | Epoche: 2 (Migration) | Status: STABLE_FROZEN

## I. DIE DOKTRIN [#INFO]
- **Zweck**: Epistemologische Kausal-Engine zur Extraktion von Liquidations-Physik.
- **Zero-Execution**: Keine Trades, nur Emission von Truth Data Standards (TDS).
- **Kinetik**: Fokus auf UPI (Unrealized Price Imbalance), ATE (Average Treatment Effect) und \tau (Causal Lag).
- **Mathematik**: CMIknn (Non-linear Mutual Information) statt linearer Korrelation.

## II. SYSTEM-ARCHITEKTUR (BARE-METAL)
- **Stack**: Docker-Compose, Python 3.10+, Redis 7, DuckDB (WAL-Mode).
- **Single-Writer-Prinzip**: Nur der `writer`-Service schreibt in die DuckDB; alle anderen lesen oder senden via Redis.
- **Services**: Ingest (BN/KR), Writer (Persistence), Brain (CMIknn), Oracle (TDS), Validator (Brier-Score).

## III. INFRASTRUKTUR-VEKTOR
- **Server**: Hetzner Ubuntu 24.04 (IP: 91.99.226.31).
- **Deploy-Pfad**: `/opt/trinity/`.
- **Sync-Vektor**: `deploy_hetzner.sh` (Master-Injection-Skript).

## IV. KRITISCHE KONFIGURATION
- **Keys**: Perplexity, Kraken, Pionex, Coinglass, Cryptopanic, Firecrawl, GitHub, Telegram (alle in .env gesichert).
- **Brier-Limit**: 0.30 (Die Guillotine).
