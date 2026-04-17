import duckdb
import pandas as pd
import logging
import os

# WAPEX + KAS Audits DBs
WAPEX_GATED_DB = '/data/trinity_apex/wapex/wapex_autopsie_kopie.duckdb' # Hier liegt wapex_gated_features
WAPEX_AUDIT_DB = '/data/trinity_apex/wapex/wapex_audit.duckdb' # Hier liegt wapex_truth_mfe_mae
OUTPUT_PARQUET = '/data/trinity_apex/wapex/training/training_matrix.parquet'

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_training_matrix():
    os.makedirs(os.path.dirname(OUTPUT_PARQUET), exist_ok=True)
    
    conn = duckdb.connect()
    
    conn.execute(f"ATTACH '{WAPEX_GATED_DB}' AS gated")
    conn.execute(f"ATTACH '{WAPEX_AUDIT_DB}' AS audit")
    
    query = """
    SELECT 
        f.*,
        t.y_300s_return as label
    FROM gated.wapex_gated_features f
    JOIN audit.wapex_truth_mfe_mae t ON f.t0_epoch = t.t0_epoch AND f.update_id = t.update_id
    """
    
    df = conn.execute(query).df()
    df.to_parquet(OUTPUT_PARQUET)
    logger.info(f"Matrix extrahiert: {len(df)} Zeilen in {OUTPUT_PARQUET}")
    conn.close()

if __name__ == "__main__":
    create_training_matrix()
