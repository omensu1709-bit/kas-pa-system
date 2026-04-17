import os
import requests
import time
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - COST_MONITOR - %(message)s')
logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
LIMIT_USD = 50.0

def check_cost():
    try:
        headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}"}
        resp = requests.get("https://openrouter.ai/api/v1/auth/key", headers=headers, timeout=5)
        usage = resp.json().get("data", {}).get("usage", 0.0)
        logger.info(f"OpenRouter Usage: ${usage:.2f} / ${LIMIT_USD:.1f}")
        if usage >= LIMIT_USD:
            # Kill-Switch: Lock trading, email alert, dump memory buffer
            logger.critical("COST LIMIT HIT. KILL SWITCH TRIGGERED.")
            with open("/data/trinity_apex/STOP_TRADING.lock", "w") as f:
                f.write(str(time.time()))
    except Exception as e:
        logger.error(f"Cost monitor failed: {e}")

if __name__ == "__main__":
    check_cost()
