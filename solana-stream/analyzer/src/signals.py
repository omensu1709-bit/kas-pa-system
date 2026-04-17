import redis
import json
import logging
from datetime import datetime
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class SignalDetector:
    """Detect trading signals from market data"""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

        # Thresholds (from research)
        self.thresholds = {
            'volume_spike_multiplier': 3.0,
            'liquidity_imbalance_threshold': 0.7,
            'bot_probability_max': 0.3,
            'whale_net_flow_threshold': -10000,  # -10k SOL = net sell
            'crash_probability_alert': 0.75,
            'accumulation_score_watch': 0.6,
        }

    def detect_short_squeeze(self, market_id: str) -> Dict:
        """
        Detect short squeeze conditions
        Primary Signal: Volume Spike + Liquidity Imbalance + Low Bot Probability + Whale Net Sell
        """
        try:
            # Get recent metrics
            buy_volume_5s = self._get_buy_volume(market_id, '5s')
            avg_buy_volume_1h = self._get_avg_buy_volume(market_id, '1h')
            liquidity_ratio = self._get_liquidity_ratio(market_id)
            bot_prob = self._get_bot_probability(market_id)
            whale_net_flow = self._get_whale_net_flow(market_id)

            # Calculate expected 5s volume from 1h average
            expected_5s = avg_buy_volume_1h / 720 if avg_buy_volume_1h > 0 else 0

            # Check conditions
            volume_spike = buy_volume_5s > (self.thresholds['volume_spike_multiplier'] * expected_5s)
            liquidity_imbalance = liquidity_ratio > self.thresholds['liquidity_imbalance_threshold']
            low_bot_prob = bot_prob < self.thresholds['bot_probability_max']
            negative_whale_flow = whale_net_flow < self.thresholds['whale_net_flow_threshold']

            # Combined signal
            signal = (
                volume_spike and
                liquidity_imbalance and
                low_bot_prob and
                negative_whale_flow
            )

            # Calculate crash probability
            crash_prob = self._calculate_crash_probability(
                liquidity_ratio,
                whale_net_flow,
                bot_prob
            )

            return {
                'signal': signal,
                'crash_probability': round(crash_prob, 3),
                'conditions': {
                    'volume_spike': volume_spike,
                    'volume_spike_ratio': round(buy_volume_5s / expected_5s if expected_5s > 0 else 0, 2),
                    'liquidity_imbalance': liquidity_imbalance,
                    'liquidity_ratio': round(liquidity_ratio, 3),
                    'low_bot_prob': low_bot_prob,
                    'bot_probability': round(bot_prob, 3),
                    'negative_whale_flow': negative_whale_flow,
                    'whale_net_flow': round(whale_net_flow, 2),
                }
            }

        except Exception as e:
            logger.error(f'Error detecting short squeeze for {market_id}: {e}')
            return {'signal': False, 'crash_probability': 0, 'conditions': {}}

    def detect_accumulation(self, market_id: str) -> Dict:
        """
        Detect accumulation phase before squeeze
        """
        try:
            net_buys_30s = self._get_net_buys(market_id, '30s')
            total_volume_30s = self._get_total_volume(market_id, '30s')

            if total_volume_30s > 0:
                accumulation_score = net_buys_30s / total_volume_30s
            else:
                accumulation_score = 0

            return {
                'accumulation_score': round(accumulation_score, 3),
                'net_buys_30s': round(net_buys_30s, 2),
                'total_volume_30s': round(total_volume_30s, 2),
                'watch_for_squeeze': accumulation_score > self.thresholds['accumulation_score_watch']
            }

        except Exception as e:
            logger.error(f'Error detecting accumulation for {market_id}: {e}')
            return {'accumulation_score': 0, 'watch_for_squeeze': False}

    def detect_liquidity_risk(self, market_id: str) -> Dict:
        """
        Detect liquidity removal risk
        """
        try:
            liquidity_change_rate = self._get_liquidity_change_rate(market_id)

            # High risk if liquidity dropped more than 15%
            high_risk = liquidity_change_rate < -0.15

            return {
                'liquidity_change_rate': round(liquidity_change_rate, 3),
                'high_risk': high_risk,
                'risk_description': (
                    'High crash risk: significant liquidity removed' if high_risk
                    else 'Liquidity stable'
                )
            }

        except Exception as e:
            logger.error(f'Error detecting liquidity risk for {market_id}: {e}')
            return {'liquidity_change_rate': 0, 'high_risk': False}

    def _calculate_crash_probability(
        self,
        liquidity_ratio: float,
        whale_net_flow: float,
        bot_prob: float
    ) -> float:
        """
        Calculate crash probability based on multiple factors
        """
        # Normalize factors to 0-1 range
        norm_liquidity = min(1.0, liquidity_ratio / 0.7)
        norm_whale = min(1.0, abs(whale_net_flow) / 50000)
        norm_bot = 1.0 - bot_prob

        # Weighted sum
        crash_prob = (
            0.3 * norm_liquidity +
            0.3 * norm_whale +
            0.2 * norm_bot +  # distribution velocity placeholder
            0.2 * norm_bot
        )

        return min(1.0, max(0.0, crash_prob))

    # Data retrieval methods (from Redis)
    def _get_buy_volume(self, market_id: str, window: str) -> float:
        """Get buy volume for time window"""
        key = f'market:{market_id}:buy_volume:{window}'
        volume = self.redis.get(key)
        return float(volume) if volume else 0.0

    def _get_avg_buy_volume(self, market_id: str, window: str) -> float:
        """Get average buy volume for time window"""
        key = f'market:{market_id}:avg_buy_volume:{window}'
        volume = self.redis.get(key)
        return float(volume) if volume else 0.0

    def _get_liquidity_ratio(self, market_id: str) -> float:
        """Get liquidity imbalance ratio"""
        key = f'market:{market_id}:liquidity_ratio'
        ratio = self.redis.get(key)
        return float(ratio) if ratio else 0.0

    def _get_bot_probability(self, market_id: str) -> float:
        """Get bot probability score"""
        key = f'market:{market_id}:bot_probability'
        prob = self.redis.get(key)
        return float(prob) if prob else 0.5  # Default 0.5 (unknown)

    def _get_whale_net_flow(self, market_id: str) -> float:
        """Get whale net flow (positive = net buy, negative = net sell)"""
        key = f'market:{market_id}:whale_net_flow'
        flow = self.redis.get(key)
        return float(flow) if flow else 0.0

    def _get_net_buys(self, market_id: str, window: str) -> float:
        """Get net buys for time window"""
        key = f'market:{market_id}:net_buys:{window}'
        buys = self.redis.get(key)
        return float(buys) if buys else 0.0

    def _get_total_volume(self, market_id: str, window: str) -> float:
        """Get total volume for time window"""
        key = f'market:{market_id}:total_volume:{window}'
        volume = self.redis.get(key)
        return float(volume) if volume else 0.0

    def _get_liquidity_change_rate(self, market_id: str) -> float:
        """Get liquidity change rate"""
        key = f'market:{market_id}:liquidity_change_rate'
        rate = self.redis.get(key)
        return float(rate) if rate else 0.0
