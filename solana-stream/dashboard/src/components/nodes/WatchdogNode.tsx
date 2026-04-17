/**
 * WatchdogNode - System watchdog monitor
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { SystemNodeWrapper } from './SystemNodeWrapper';
import { useSystemStore } from '../../stores/systemStore';

export const WatchdogNode = memo(function WatchdogNode(_props: NodeProps) {
  const watchdog = useSystemStore((s) => s.watchdog);

  return (
    <>
      <Handle type="target" position={Position.Left} />
      
      <SystemNodeWrapper
        title="System Watchdog"
        icon="🐕"
        status={watchdog.status}
        latency={undefined}
        lastUpdate={watchdog.lastUpdate}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '9px' }}>
          {/* Uptime */}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#888' }}>Backend Uptime</span>
            <span style={{ color: '#00ff88' }}>
              {((watchdog.backendUptime || 0) / 3600).toFixed(2)}h
            </span>
          </div>

          {/* Veto Statistics */}
          <div style={{ borderTop: '1px solid #1e1e3f', paddingTop: '4px', marginTop: '2px' }}>
            <div style={{ color: '#666', marginBottom: '2px', textTransform: 'uppercase' }}>Veto Statistics</div>
            {Object.entries(watchdog.vetoStatistics).map(([reason, count]) => (
              <div key={reason} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#888' }}>{reason}</span>
                <span style={{ color: '#e74c3c' }}>{count}</span>
              </div>
            ))}
          </div>

          {/* Recent trades */}
          <div style={{ borderTop: '1px solid #1e1e3f', paddingTop: '4px', marginTop: '2px' }}>
            <div style={{ color: '#666', marginBottom: '2px', textTransform: 'uppercase' }}>Last 3 Trades</div>
            {watchdog.lastTrades.slice(0, 3).map((trade, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#888' }}>{trade.symbol}</span>
                <span style={{ color: (trade.pnl || 0) >= 0 ? '#00ff88' : '#ff4757' }}>
                  {(trade.pnl || 0).toFixed(4)} SOL
                </span>
              </div>
            ))}
          </div>
        </div>
      </SystemNodeWrapper>
      
      <Handle type="source" position={Position.Right} />
    </>
  );
});
