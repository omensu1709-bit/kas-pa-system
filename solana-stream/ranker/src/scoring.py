import redis
import json
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class MarketScorer:
    """Calculate importance scores for markets based on activity metrics"""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

        # Scoring weights (0-100 total)
        self.weights = {
            'volume': 30,      # Volume spike detection
            'volatility': 25,  # Price volatility
            'whale': 25,       # Whale activity
            'distribution': 20  # Holder distribution
        }

    def calculate_score(self, market_id: str) -> dict:
        """Calculate importance score for a market (0-100)"""

        try:
            # Get metrics from Redis
            volume_5m = self._get_volume(market_id, '5m')
            volume_1h = self._get_volume(market_id, '1h')
            volatility = self._get_volatility(market_id)
            whale_activity = self._get_whale_activity(market_id)
            unique_holders = self._get_unique_holders(market_id)

            # Volume spike score (0-30 points)
            if volume_1h > 0:
                # Compare 5min volume to expected 5min average from 1h
                expected_5m = volume_1h / 12
                spike_ratio = volume_5m / expected_5m if expected_5m > 0 else 0
                volume_score = min(self.weights['volume'], spike_ratio * 10)
            else:
                volume_score = 0

            # Volatility score (0-25 points)
            # Normalize volatility (0.01 = 1% change)
            volatility_score = min(self.weights['volatility'], volatility * 100)

            # Whale activity score (0-25 points)
            # whale_activity is already in SOL, normalize to score
            whale_score = min(self.weights['whale'], whale_activity * 2.5)

            # Distribution score (0-20 points)
            # More unique holders = better distribution
            distribution_score = min(self.weights['distribution'], unique_holders * 0.5)

            total_score = (
                volume_score +
                volatility_score +
                whale_score +
                distribution_score
            )

            return {
                'market_id': market_id,
                'score': round(total_score, 2),
                'tier': self._get_tier(total_score),
                'timestamp': datetime.utcnow().isoformat(),
                'breakdown': {
                    'volume': round(volume_score, 2),
                    'volatility': round(volatility_score, 2),
                    'whale': round(whale_score, 2),
                    'distribution': round(distribution_score, 2)
                },
                'raw_metrics': {
                    'volume_5m': volume_5m,
                    'volume_1h': volume_1h,
                    'volatility': volatility,
                    'whale_activity': whale_activity,
                    'unique_holders': unique_holders
                }
            }

        except Exception as e:
            logger.error(f'Error calculating score for {market_id}: {e}')
            return None

    def _get_tier(self, score: float) -> str:
        """Assign TIER based on score"""
        if score >= 70:
            return 'TIER1'
        elif score >= 40:
            return 'TIER2'
        else:
            return 'TIER3'

    def _get_volume(self, market_id: str, window: str) -> float:
        """Get trading volume for a time window"""
        key = f'market:{market_id}:volume:{window}'
        volume = self.redis.get(key)
        return float(volume) if volume else 0.0

    def _get_volatility(self, market_id: str) -> float:
        """Get price volatility (standard deviation of returns)"""
        key = f'market:{market_id}:volatility'
        vol = self.redis.get(key)
        return float(vol) if vol else 0.0

    def _get_whale_activity(self, market_id: str) -> float:
        """Get whale activity (volume from large traders)"""
        key = f'market:{market_id}:whale_volume'
        volume = self.redis.get(key)
        return float(volume) if volume else 0.0

    def _get_unique_holders(self, market_id: str) -> int:
        """Get number of unique holders"""
        key = f'market:{market_id}:unique_holders'
        holders = self.redis.get(key)
        return int(holders) if holders else 0

    def update_market_metrics(self, market_id: str, tx_data: dict):
        """Update market metrics from transaction data"""
        try:
            now = datetime.utcnow()

            # Update volume metrics
            volume_key_5m = f'market:{market_id}:volume:5m'
            volume_key_1h = f'market:{market_id}:volume:1h'

            # Use Redis sorted sets for time-bucketed volumes
            volume_5m_key = f'market:{market_id}:volume:5m:bucket'
            volume_1h_key = f'market:{market_id}:volume:1h:bucket'

            # Add volume to buckets with timestamp
            if 'amount' in tx_data:
                self.redis.zadd(
                    volume_5m_key,
                    {str(tx_data['amount']): now.timestamp()}
                )
                self.redis.zadd(
                    volume_1h_key,
                    {str(tx_data['amount']): now.timestamp()}
                )

                # Clean old entries (5 min window)
                cutoff_5m = (now - timedelta(minutes=5)).timestamp()
                self.redis.zremrangebyscore(volume_5m_key, 0, cutoff_5m)

                # Clean old entries (1 hour window)
                cutoff_1h = (now - timedelta(hours=1)).timestamp()
                self.redis.zremrangebyscore(volume_1h_key, 0, cutoff_1h)

                # Set TTL
                self.redis.expire(volume_5m_key, 600)
                self.redis.expire(volume_1h_key, 7200)

            # Update whale metrics
            if 'amount' in tx_data and tx_data.get('amount', 0) > 10000:  # >10k SOL
                whale_key = f'market:{market_id}:whale_volume'
                self.redis.incrbyfloat(whale_key, tx_data.get('amount', 0))
                self.redis.expire(whale_key, 3600)

        except Exception as e:
            logger.error(f'Error updating metrics for {market_id}: {e}')
