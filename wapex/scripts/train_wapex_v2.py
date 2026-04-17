import duckdb
import pandas as pd
import logging
import os
import lightgbm as lgb
import numpy as np

# Konfig
WAPEX_AUT_DB = '/data/trinity_apex/wapex/wapex_audit.duckdb'
WAPEX_GATED_DB = '/data/trinity_apex/wapex/wapex_autopsie_kopie.duckdb'
MODEL_PATH = '/data/trinity_apex/wapex/models/wapex_lgbm_v2.txt'

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def train():
    os.makedirs('/data/trinity_apex/wapex/models/', exist_ok=True)
    conn = duckdb.connect()
    conn.execute(f"ATTACH '{WAPEX_AUT_DB}' AS audit")
    conn.execute(f"ATTACH '{WAPEX_GATED_DB}' AS gated")
    
    # Vereinfachtes Join-Modell
    query = """
    SELECT 
        f.*,
        t.y_300s_return as label
    FROM gated.wapex_gated_features f
    JOIN audit.telemetry_table t ON f.t0_epoch = t.timestamp_ns/1e9 AND f.update_id = t.signal_id
    """
    df = conn.execute(query).df()
    
    # Feature-Auswahl (nur numerische)
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    numeric_cols.remove('label')
    if 't0_epoch' in numeric_cols: numeric_cols.remove('t0_epoch')
    
    X = df[numeric_cols].fillna(0)
    y = df['label']
    
    model = lgb.LGBMRegressor(objective='huber', n_estimators=200)
    model.fit(X, y)
    model.booster_.save_model(MODEL_PATH)
    logger.info(f"Modell gespeichert: {MODEL_PATH}")
    conn.close()

if __name__ == "__main__":
    train()
