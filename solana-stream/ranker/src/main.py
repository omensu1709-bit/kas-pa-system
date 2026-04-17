import redis
import json
import time
import logging
from datetime import datetime
from scoring import MarketScorer
from marketdb import MarketDatabase

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class RankingService:
    def __init__(self):
        self.redis_client = redis.Redis(
            host=process.env.get('REDIS_HOST', 'localhost'),
            port=int(process.env.get('REDIS_PORT', 6379)),
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5,
            retry_on_timeout=True
        )
        self.scorer = MarketScorer(self.redis_client)
        self.market_db = MarketDatabase(self.redis_client)

        # TIER limits (AX42 optimized for 1Gbps)
        self.tier1_limit = 10   # Helius: max 10 accounts
        self.tier2_limit = 30   # Chainstack: max 30 accounts

        # Scoring thresholds
        self.tier1_threshold = 70  # Score >= 70 = TIER 1
        self.tier2_threshold = 40   # Score >= 40 = TIER 2

        # Update interval
        self.update_interval = 30  # seconds

        logger.info('RankingService initialized')
        logger.info(f'TIER1 limit: {self.tier1_limit}, TIER2 limit: {self.tier2_limit}')

    def ping_redis(self) -> bool:
        """Check Redis connectivity"""
        try:
            return self.redis_client.ping()
        except Exception as e:
            logger.error(f'Redis ping failed: {e}')
            return False

    def get_all_market_scores(self) -> list:
        """Get all market scores from Redis"""
        scores = []

        try:
            # Get all market keys
            market_ids = self.market_db.get_all_markets()

            for market_id in market_ids:
                score_data = self.scorer.calculate_score(market_id)
                if score_data:
                    scores.append(score_data)

        except Exception as e:
            logger.error(f'Error getting market scores: {e}')

        return scores

    def sync_tiers(self) -> dict:
        """Synchronize TIER assignments"""
        logger.info('Starting tier sync...')

        # Get all market scores
        all_scores = self.get_all_market_scores()

        if not all_scores:
            logger.warning('No market scores available')
            return {'tier1': [], 'tier2': [], 'tier3': 0}

        # Sort by score descending
        all_scores.sort(key=lambda x: x['score'], reverse=True)

        # Assign TIER 1: Top scores with minimum threshold
        tier1 = [
            m for m in all_scores[:self.tier1_limit]
            if m['score'] >= 40  # Minimum threshold
        ]

        # Assign TIER 2: Next batch after TIER 1
        tier1_ids = set(m['market_id'] for m in tier1)
        tier2 = [
            m for m in all_scores
            if m['market_id'] not in tier1_ids and m['score'] >= self.tier2_threshold
        ][:self.tier2_limit]

        # Rest are TIER 3 (polling)
        tier1_ids = set(m['market_id'] for m in tier1)
        tier2_ids = set(m['market_id'] for m in tier2)
        tier3_count = len([m for m in all_scores
                          if m['market_id'] not in tier1_ids
                          and m['market_id'] not in tier2_ids])

        # Store TIER 1 assignments
        tier1_ids_list = [m['market_id'] for m in tier1]
        self.redis_client.set('tiers:tier1', json.dumps(tier1_ids_list))
        self.redis_client.set('tiers:tier1:scores', json.dumps([
            {'id': m['market_id'], 'score': m['score']} for m in tier1
        ]))

        # Store TIER 2 assignments
        tier2_ids_list = [m['market_id'] for m in tier2]
        self.redis_client.set('tiers:tier2', json.dumps(tier2_ids_list))
        self.redis_client.set('tiers:tier2:scores', json.dumps([
            {'id': m['market_id'], 'score': m['score']} for m in tier2
        ]))

        # Store metadata
        self.redis_client.set('tiers:last_update', datetime.utcnow().isoformat())
        self.redis_client.set('tiers:total_markets', str(len(all_scores)))

        # Publish update for ingestor
        update_message = json.dumps({
            'tier1': tier1_ids_list,
            'tier2': tier2_ids_list,
            'timestamp': datetime.utcnow().isoformat()
        })
        self.redis_client.publish('tier_updates', update_message)

        result = {
            'tier1': tier1_ids_list,
            'tier2': tier2_ids_list,
            'tier3': tier3_count,
            'total': len(all_scores)
        }

        logger.info(
            f'Tier sync complete: '
            f'TIER1={len(tier1)}, '
            f'TIER2={len(tier2)}, '
            f'TIER3={tier3_count}'
        )

        return result

    def run(self):
        """Main loop"""
        logger.info('RankingService starting...')

        # Wait for Redis
        while not self.ping_redis():
            logger.warning('Waiting for Redis...')
            time.sleep(5)

        logger.info('Connected to Redis')

        # Main loop
        while True:
            try:
                self.sync_tiers()
            except Exception as e:
                logger.error(f'Error in sync loop: {e}')

            time.sleep(self.update_interval)


def main():
    service = RankingService()
    service.run()


if __name__ == '__main__':
    main()
