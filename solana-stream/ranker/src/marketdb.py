import redis
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)


class MarketDatabase:
    """Manage market data in Redis"""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    def get_all_markets(self) -> List[str]:
        """Get all known market IDs"""
        try:
            # Scan for market keys
            markets = set()
            for key in self.redis.scan_iter('market:*:volume:*'):
                # Extract market_id from key pattern: market:{id}:volume:{window}
                parts = key.split(':')
                if len(parts) >= 2:
                    markets.add(parts[1])

            return list(markets)
        except Exception as e:
            logger.error(f'Error getting all markets: {e}')
            return []

    def add_market(self, market_id: str):
        """Add a new market to tracking"""
        self.redis.sadd('markets:active', market_id)
        self.redis.sadd('markets:all', market_id)

    def remove_market(self, market_id: str):
        """Remove a market from active tracking"""
        self.redis.srem('markets:active', market_id)

    def get_active_markets(self) -> List[str]:
        """Get all actively tracked markets"""
        return list(self.redis.smembers('markets:active') or set())

    def market_exists(self, market_id: str) -> bool:
        """Check if market exists"""
        return self.redis.sismember('markets:all', market_id)

    def set_market_metadata(self, market_id: str, metadata: dict):
        """Store market metadata"""
        key = f'market:{market_id}:metadata'
        self.redis.hset(key, mapping=metadata)
        self.redis.expire(key, 86400)  # 24 hour TTL

    def get_market_metadata(self, market_id: str) -> Optional[dict]:
        """Get market metadata"""
        key = f'market:{market_id}:metadata'
        data = self.redis.hgetall(key)
        return data if data else None

    def record_trade(self, market_id: str, trade_data: dict):
        """Record a trade for market analytics"""
        import json
        from datetime import datetime

        # Add to recent trades list
        key = f'market:{market_id}:trades:recent'
        self.redis.lpush(key, json.dumps({
            **trade_data,
            'timestamp': datetime.utcnow().isoformat()
        }))
        self.redis.ltrim(key, 0, 999)  # Keep last 1000 trades
        self.redis.expire(key, 3600)  # 1 hour TTL

        # Update market as active
        self.add_market(market_id)

    def get_recent_trades(self, market_id: str, limit: int = 100) -> list:
        """Get recent trades for a market"""
        import json
        key = f'market:{market_id}:trades:recent'
        trades = self.redis.lrange(key, 0, limit - 1)
        return [json.loads(t) for t in trades]
