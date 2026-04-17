#!/usr/bin/env python3
"""TRINITY V_APEX - Persistence Kernel (Single-Writer)"""
import os, json, logging, redis, duckdb

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
DUCKDB_PATH = "/app/data/trinity.duckdb"
QUEUES = ["ingest:bn:cvd", "ingest:bn:liquidation", "ingest:kr:oi", "ingest:kr:funding", "queue:writer:causal"]

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WRITER")

def init_db():
    conn = duckdb.connect(DUCKDB_PATH)
    conn.execute("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA wal_autocheckpoint=10000;")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS market_events (id BIGSERIAL PRIMARY KEY, event_type VARCHAR, symbol VARCHAR, side VARCHAR, amount DOUBLE, price DOUBLE, timestamp BIGINT, extra JSON);
        CREATE TABLE IF NOT EXISTS causal_links (id TEXT PRIMARY KEY, symbol VARCHAR UNIQUE, analysis_time TIMESTAMP, source VARCHAR, target VARCHAR, lag_minutes INTEGER, strength DOUBLE, p_value DOUBLE, brier_score DOUBLE DEFAULT 0.5);
        CREATE TABLE IF NOT EXISTS oracle_predictions (id TEXT PRIMARY KEY, symbol VARCHAR, signal_direction VARCHAR, causal_lag_minutes INTEGER, probability DOUBLE, ate_strength DOUBLE, timestamp_emitted TIMESTAMP, actual_outcome DOUBLE DEFAULT NULL, verified_truth BOOLEAN DEFAULT NULL);
    """)
    return conn

def run_writer():
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    conn = init_db()
    logger.info("WRITER ONLINE. Strict Single-Writer Enforced.")
    
    while True:
        try:
            result = r.blpop(QUEUES, timeout=1)
            if not result: continue
            q, payload = result
            ev = json.loads(payload)
            
            if ev.get("event_type") == "causal_link":
                conn.execute("INSERT OR REPLACE INTO causal_links (id, symbol, analysis_time, source, target, lag_minutes, strength, p_value) VALUES (uuid(), ?, to_timestamp(?), ?, ?, ?, ?, ?)", 
                             [ev['symbol'], ev['analysis_time']/1000, ev['source'], ev['target'], ev['lag_minutes'], ev['strength'], ev['p_value']])
            elif ev.get("event_type") == "tds_prediction":
                conn.execute("INSERT INTO oracle_predictions (id, symbol, signal_direction, causal_lag_minutes, probability, ate_strength, timestamp_emitted) VALUES (uuid(), ?, ?, ?, ?, ?, to_timestamp(?))",
                             [ev['symbol'], ev['signal_direction'], ev['lag'], ev['probability'], ev['ate'], ev['timestamp']/1000])
            else:
                conn.execute("INSERT INTO market_events (event_type, symbol, side, amount, price, timestamp, extra) VALUES (?, ?, ?, ?, ?, ?, ?)",
                             [ev['event_type'], ev['symbol'], ev.get('side'), ev.get('amount',0), ev.get('price',0), ev['timestamp'], json.dumps(ev.get('extra', {}))])
            conn.commit()
        except Exception as e:
            logger.error(f"Write Error: {e}")

if __name__ == "__main__": run_writer()
