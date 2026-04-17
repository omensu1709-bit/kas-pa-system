import asyncio
import orjson as json
import logging
import os
import signal
import sys
import time
from typing import Any

import redis.asyncio as redis
import duckdb

import lightgbm as lgb
import joblib

# Load trained model
MODEL_PATH = '/data/trinity_apex/wapex/models/wapex_lgbm_v1.txt'
MODEL = lgb.Booster(model_file=MODEL_PATH)

LOGGER = logging.getLogger("wapex.execution_engine")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")

# --- Configuration ---
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
ALERT_CHANNEL = "wapex:structural_alerts"
PERFORMANCE_KEY = "wapex:dashboard:performance"
KILL_SWITCH_FILE = "/data/trinity_apex/STOP_TRADING.lock"
DB_PATH = "/data/trinity_apex/wapex/wapex_audit.duckdb"

# Cold Math Constants (BPS)
TAKER_FEE_BPS = 10.0
ADVERSE_SELECTION_BPS = 3.0
TOTAL_FRICTION_BPS = TAKER_FEE_BPS + ADVERSE_SELECTION_BPS

DEFAULT_PRICE_FALLBACK = 150.0

def is_kill_switch_active() -> bool:
    return os.path.exists(KILL_SWITCH_FILE)

def init_db():
    try:
        with duckdb.connect(DB_PATH) as conn:
            conn.execute("PRAGMA memory_limit='16GB';")
            conn.execute("PRAGMA threads=4;")
            # Memory-Buffer Flush: WAL setting to prevent thread-locking
            conn.execute("PRAGMA wal_autocheckpoint='16MB';")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS telemetry_table (
                    signal_id VARCHAR,
                    timestamp_ns BIGINT,
                    asset VARCHAR,
                    signal_vector INTEGER,
                    omega_sigma DOUBLE,
                    P_sim_entry DOUBLE,
                    P_actual_t60 DOUBLE,
                    P_actual_t180 DOUBLE,
                    P_actual_t300 DOUBLE
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry_table (timestamp_ns)")
    except Exception as e:
        LOGGER.error("Failed to init DuckDB: %s", e)

class FixedHorizonTelemetry:
    def __init__(self, rds: redis.Redis):
        self.rds = rds
        self.shutdown_event = asyncio.Event()
        self.insert_queue = asyncio.Queue()
        self.update_queue = asyncio.Queue()

    async def get_mid_price(self) -> float:
        """Fetch current L1 Mid Price from Redis."""
        try:
            binance_raw = await self.rds.get("wapex:state:binance_ticker")
            if binance_raw:
                data = json.loads(binance_raw)
                bid = float(data.get("best_bid", 0))
                ask = float(data.get("best_ask", 0))
                if bid > 0 and ask > 0:
                    return (bid + ask) / 2.0
            
            bybit_raw = await self.rds.get("wapex:state:bybit_ticker")
            if bybit_raw:
                data = json.loads(bybit_raw)
                bid = float(data.get("best_bid", 0))
                ask = float(data.get("best_ask", 0))
                if bid > 0 and ask > 0:
                    return (bid + ask) / 2.0
                    
            return DEFAULT_PRICE_FALLBACK
        except Exception as e:
            LOGGER.error("Error fetching mid price: %s", e)
            return DEFAULT_PRICE_FALLBACK

    async def _capture_delayed_price(self, signal_id: str, vector: int, delay_sec: int, column_name: str):
        """Async callback to capture price after a fixed horizon."""
        await asyncio.sleep(delay_sec)
        price = await self.get_mid_price()
        await self.update_queue.put((column_name, price, signal_id, vector))
        LOGGER.info("[%s] Queued %s: %.4f for vector %d", signal_id, column_name, price, vector)

    async def _db_writer_loop(self):
        """Batches inserts and updates to DuckDB to prevent I/O blocking."""
        LOGGER.info("DuckDB batch writer loop started.")
        while not self.shutdown_event.is_set():
            inserts = []
            updates = []
            
            # Drain insert queue
            while not self.insert_queue.empty():
                try:
                    inserts.append(self.insert_queue.get_nowait())
                except asyncio.QueueEmpty:
                    break
                    
            # Drain update queue
            while not self.update_queue.empty():
                try:
                    updates.append(self.update_queue.get_nowait())
                except asyncio.QueueEmpty:
                    break

            if inserts or updates:
                try:
                    # Run DB writes in a thread to not block the uvloop
                    await asyncio.to_thread(self._execute_db_batch, inserts, updates)
                except Exception as e:
                    LOGGER.error(f"Batch write failed: {e}")
                    
            await asyncio.sleep(1.0) # Write every 1 second
            
    def _execute_db_batch(self, inserts, updates):
        with duckdb.connect(DB_PATH) as conn:
            conn.execute("BEGIN TRANSACTION")
            try:
                if inserts:
                    conn.executemany(
                        "INSERT INTO telemetry_table (signal_id, timestamp_ns, asset, signal_vector, omega_sigma, P_sim_entry, predicted_drawdown) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        inserts
                    )
                for up in updates:
                    column_name, price, signal_id, vector = up
                    query = f"UPDATE telemetry_table SET {column_name} = ? WHERE signal_id = ? AND signal_vector = ?"
                    conn.execute(query, [price, signal_id, vector])
                conn.execute("COMMIT")
            except Exception as e:
                conn.execute("ROLLBACK")
                raise e

    async def process_signal(self, alert: dict[str, Any]):
        timestamp_ns = time.time_ns()
        asset = alert.get("asset", alert.get("symbol", "SOLUSDT"))
        # --- SHADOW INFERENCE ---
        # Extrahiere features aus der alert-payload
        features = [
            omega_sigma,
            float(alert.get("signal_vector", 0.0))
        ]
        
        # prediction (max_drawdown expectation)
        pred_drawdown = float(MODEL.predict([features])[0])
        
        LOGGER.info("[%s] Shadow prediction: %.2f%% expected drawdown", asset, pred_drawdown*100)
        
        signal_id = f"sig_{timestamp_ns}_{os.urandom(2).hex()}"
        
        extra = alert.get("extra", {})
        omega_sigma = float(extra.get("omega_sigma", alert.get("omega_sigma", 0.0)))
        
        mid_price = await self.get_mid_price()
        
        # Dual-Vector Logging (Symmetry)
        for vector in [1, -1]:
            # VWAP Execution Simulation Integration
            # If the detector sent us the dynamically calculated VWAP prices, use them
            if vector == 1 and "p_sim_long" in extra and extra["p_sim_long"] > 0:
                p_sim_entry = float(extra["p_sim_long"])
            elif vector == -1 and "p_sim_short" in extra and extra["p_sim_short"] > 0:
                p_sim_entry = float(extra["p_sim_short"])
            else:
                # Fallback to Static Friction
                friction_multiplier = 1 + (TOTAL_FRICTION_BPS / 10000.0) if vector == 1 else 1 - (TOTAL_FRICTION_BPS / 10000.0)
                p_sim_entry = mid_price * friction_multiplier
            
            await self.insert_queue.put((signal_id, timestamp_ns, asset, vector, omega_sigma, p_sim_entry, pred_drawdown))

            # Spawn horizon capture tasks
            asyncio.create_task(self._capture_delayed_price(signal_id, vector, 60, "P_actual_t60"))
            asyncio.create_task(self._capture_delayed_price(signal_id, vector, 180, "P_actual_t180"))
            asyncio.create_task(self._capture_delayed_price(signal_id, vector, 300, "P_actual_t300"))

        LOGGER.info("[%s] Signal processed. P_mid: %.4f, VECTORS: [+1, -1]", signal_id, mid_price)

    async def monitor_loop(self):
        pubsub = self.rds.pubsub()
        await pubsub.subscribe(ALERT_CHANNEL)
        LOGGER.info("WAPEX V3 Cold Math Engine (Fixed Horizon) running...")

        writer_task = asyncio.create_task(self._db_writer_loop())

        try:
            while not self.shutdown_event.is_set():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if not message:
                    continue
                    
                try:
                    alert = json.loads(message["data"])
                    
                    if is_kill_switch_active():
                        LOGGER.warning("[KILL SWITCH] STOP_TRADING.lock active. Ignoring signal.")
                        continue
                        
                    await self.process_signal(alert)
                        
                except Exception as e:
                    LOGGER.error("Error in monitor loop: %s", e)
                
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(ALERT_CHANNEL)
            await pubsub.aclose()
            # Wait for writer to flush remaining
            await asyncio.sleep(1.5)

async def async_main():
    init_db()
    rds = redis.from_url(REDIS_URL, decode_responses=True)
    engine = FixedHorizonTelemetry(rds)
    
    loop = asyncio.get_running_loop()
    def handle_sig():
        LOGGER.info("Shutting down engine...")
        engine.shutdown_event.set()
        
    loop.add_signal_handler(signal.SIGTERM, handle_sig)
    loop.add_signal_handler(signal.SIGINT, handle_sig)
    
    try:
        await engine.monitor_loop()
    finally:
        await rds.aclose()

if __name__ == "__main__":
    asyncio.run(async_main())
