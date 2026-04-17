# TRINITY_APEX_CONTEXT_MAP
# ========================

## Architektur-Überblick (Live)
- **Repo-Root**: /data/trinity_apex
- **Core-System**: /wapex/
- **Legacy/Support**: /kas/ (Ghost-Services) mit aktiven Telemetrie-Exports
- **Execution-Engine**: wapex_execution_engine.py (Shadow-mode: Prädiktion → logger)
- **Storage**: wapex_audit.duckdb (telemetry_table)

## Aktive Subsysteme
- Ingestion-Streams: Yellowstone gRPC (Chainstack)
- Bybit L1 Ingestion: kas_ingestor.py / wapex_bybit_ingestor.py
- LightGBM-Pipeline: Walk-Forward CV, 25 Features

## Kritische Pfade (Latenz)
- Latency-Budget: < 10ms (Shadow-Inference)
- OOB-Redis: 6380 (Dashboard-Bus)
- KAS-Data-Redis: 6379 (Live-Data)

## Aktueller Status: 
Pipeline stabil, 781 Labels (Bootstrap), Schatten-Inferenz aktiv.
