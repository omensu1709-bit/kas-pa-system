import redis
import json
import time
import logging
from datetime import datetime
from signals import SignalDetector
from alerts import AlertManager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AnalyzerService:
    def __init__(self):
        self.redis_client = redis.Redis(
            host=process.env.get('REDIS_HOST', 'localhost'),
            port=int(process.env.get('REDIS_PORT', 6379)),
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5,
            retry_on_timeout=True
        )
        self.signal_detector = SignalDetector(self.redis_client)
        self.alert_manager = AlertManager(self.redis_client)

        # Analysis interval
        self.analysis_interval = 5  # seconds

        logger.info('AnalyzerService initialized')

    def ping_redis(self) -> bool:
        """Check Redis connectivity"""
        try:
            return self.redis_client.ping()
        except Exception as e:
            logger.error(f'Redis ping failed: {e}')
            return False

    def get_active_markets(self) -> list:
        """Get list of markets to analyze"""
        try:
            # Get markets from TIER 1 and TIER 2
            tier1_raw = self.redis_client.get('tiers:tier1')
            tier2_raw = self.redis_client.get('tiers:tier2')

            tier1 = json.loads(tier1_raw) if tier1_raw else []
            tier2 = json.loads(tier2_raw) if tier2_raw else []

            # Combine and dedupe
            all_markets = list(set(tier1 + tier2))

            return all_markets

        except Exception as e:
            logger.error(f'Error getting active markets: {e}')
            return []

    def analyze_market(self, market_id: str) -> dict:
        """Analyze a single market for trading signals"""
        try:
            # Run signal detection
            short_squeeze = self.signal_detector.detect_short_squeeze(market_id)
            accumulation = self.signal_detector.detect_accumulation(market_id)
            liquidity = self.signal_detector.detect_liquidity_risk(market_id)

            # Combine signals
            signals = {
                'market_id': market_id,
                'timestamp': datetime.utcnow().isoformat(),
                'short_squeeze': short_squeeze,
                'accumulation': accumulation,
                'liquidity_risk': liquidity,
            }

            # Check if alert should be generated
            if self.should_alert(signals):
                self.alert_manager.create_alert(signals)

            return signals

        except Exception as e:
            logger.error(f'Error analyzing market {market_id}: {e}')
            return None

    def should_alert(self, signals: dict) -> bool:
        """Determine if signals warrant an alert"""
        # Alert if crash probability is high
        if signals.get('short_squeeze', {}).get('crash_probability', 0) > 0.75:
            return True

        # Alert if accumulation is significant
        if signals.get('accumulation', {}).get('watch_for_squeeze', False):
            return True

        # Alert if liquidity risk is high
        if signals.get('liquidity_risk', {}).get('high_risk', False):
            return True

        return False

    def run_analysis_cycle(self):
        """Run one cycle of market analysis"""
        markets = self.get_active_markets()

        if not markets:
            logger.debug('No active markets to analyze')
            return

        logger.info(f'Analyzing {len(markets)} markets...')

        for market_id in markets:
            signals = self.analyze_market(market_id)
            if signals:
                # Log significant signals
                if signals['short_squeeze']['signal']:
                    logger.warning(
                        f"SHORT SQUEEZE SIGNAL: {market_id} - "
                        f"Probability: {signals['short_squeeze']['crash_probability']:.2f}"
                    )

    def run(self):
        """Main loop"""
        logger.info('AnalyzerService starting...')

        # Wait for Redis
        while not self.ping_redis():
            logger.warning('Waiting for Redis...')
            time.sleep(5)

        logger.info('Connected to Redis')

        # Main loop
        while True:
            try:
                self.run_analysis_cycle()
            except Exception as e:
                logger.error(f'Error in analysis loop: {e}')

            time.sleep(self.analysis_interval)


def main():
    service = AnalyzerService()
    service.run()


if __name__ == '__main__':
    main()
