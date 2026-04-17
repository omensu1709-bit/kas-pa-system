import pandas as pd
import lightgbm as lgb
import os
import joblib

def train_model():
    df = pd.read_parquet('/data/trinity_apex/wapex/training/training_matrix.parquet')
    X = df[['omega_sigma', 'signal_vector']] # Basis fuer den Anfang
    y = df['draw_down_4h']
    
    # LightGBM Training
    model = lgb.LGBMRegressor(objective='huber', n_estimators=100)
    model.fit(X, y)
    
    # Speichern
    model.booster_.save_model('/data/trinity_apex/wapex/models/wapex_lgbm_v1.txt')
    print("Modell gespeichert.")

if __name__ == "__main__":
    train_model()
