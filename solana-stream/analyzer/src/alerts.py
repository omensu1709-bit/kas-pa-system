import redis
import json
import logging
from datetime import datetime
from typing import Dict
import os

logger = logging.getLogger(__name__)


class AlertManager:
    """Manage and dispatch trading alerts"""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.alerts_dir = '/app/alerts'

        # Alert cooldown (prevent spam)
        self.alert_cooldown = 300  # 5 minutes

    def should_send_alert(self, market_id: str, alert_type: str) -> bool:
        """Check if alert should be sent (cooldown check)"""
        key = f'alert:cooldown:{market_id}:{alert_type}'
        exists = self.redis.exists(key)
        return not exists

    def set_alert_cooldown(self, market_id: str, alert_type: str):
        """Set cooldown after sending alert"""
        key = f'alert:cooldown:{market_id}:{alert_type}'
        self.redis.setex(key, self.alert_cooldown, '1')

    def create_alert(self, signals: Dict):
        """Create and store an alert"""
        try:
            market_id = signals['market_id']
            alert_type = self._determine_alert_type(signals)

            # Check cooldown
            if not self.should_send_alert(market_id, alert_type):
                logger.debug(f'Alert suppressed (cooldown): {market_id} {alert_type}')
                return None

            # Create alert object
            alert = {
                'id': f"{market_id}_{alert_type}_{int(datetime.utcnow().timestamp())}",
                'market_id': market_id,
                'type': alert_type,
                'timestamp': datetime.utcnow().isoformat(),
                'signals': signals,
                'severity': self._determine_severity(signals),
            }

            # Store in Redis
            alert_key = f"alert:{alert['id']}"
            self.redis.set(alert_key, json.dumps(alert))
            self.redis.expire(alert_key, 86400)  # 24 hour TTL

            # Add to alerts list
            self.redis.lpush('alerts:recent', alert['id'])
            self.redis.ltrim('alerts:recent', 0, 99)  # Keep last 100

            # Set cooldown
            self.set_alert_cooldown(market_id, alert_type)

            # Write to file for external monitoring
            self._write_alert_file(alert)

            logger.warning(
                f"ALERT CREATED: {alert_type} - {market_id} - "
                f"Severity: {alert['severity']}"
            )

            return alert

        except Exception as e:
            logger.error(f'Error creating alert: {e}')
            return None

    def _determine_alert_type(self, signals: Dict) -> str:
        """Determine alert type based on signals"""
        if signals.get('short_squeeze', {}).get('signal'):
            return 'SHORT_SQUEEZE'

        if signals.get('accumulation', {}).get('watch_for_squeeze'):
            return 'ACCUMULATION'

        if signals.get('liquidity_risk', {}).get('high_risk'):
            return 'LIQUIDITY_RISK'

        return 'GENERAL'

    def _determine_severity(self, signals: Dict) -> str:
        """Determine alert severity"""
        crash_prob = signals.get('short_squeeze', {}).get('crash_probability', 0)

        if crash_prob > 0.85:
            return 'CRITICAL'
        elif crash_prob > 0.75:
            return 'HIGH'
        elif crash_prob > 0.5:
            return 'MEDIUM'
        else:
            return 'LOW'

    def _write_alert_file(self, alert: Dict):
        """Write alert to file for external monitoring"""
        try:
            filename = f"{self.alerts_dir}/{alert['id']}.json"
            with open(filename, 'w') as f:
                json.dump(alert, f, indent=2)

            # Also write latest alert for quick access
            latest_file = f"{self.alerts_dir}/latest.json"
            with open(latest_file, 'w') as f:
                json.dump(alert, f, indent=2)

        except Exception as e:
            logger.error(f'Error writing alert file: {e}')

    def get_recent_alerts(self, limit: int = 10) -> list:
        """Get recent alerts"""
        try:
            alert_ids = self.redis.lrange('alerts:recent', 0, limit - 1)
            alerts = []

            for alert_id in alert_ids:
                alert_data = self.redis.get(f'alert:{alert_id}')
                if alert_data:
                    alerts.append(json.loads(alert_data))

            return alerts

        except Exception as e:
            logger.error(f'Error getting recent alerts: {e}')
            return []

    def get_alert_stats(self) -> Dict:
        """Get alert statistics"""
        try:
            total = self.redis.llen('alerts:recent')

            # Count by type
            alert_ids = self.redis.lrange('alerts:recent', 0, -1)
            type_counts = {}

            for alert_id in alert_ids:
                alert_data = self.redis.get(f'alert:{alert_id}')
                if alert_data:
                    alert = json.loads(alert_data)
                    alert_type = alert.get('type', 'UNKNOWN')
                    type_counts[alert_type] = type_counts.get(alert_type, 0) + 1

            return {
                'total': total,
                'by_type': type_counts
            }

        except Exception as e:
            logger.error(f'Error getting alert stats: {e}')
            return {'total': 0, 'by_type': {}}
