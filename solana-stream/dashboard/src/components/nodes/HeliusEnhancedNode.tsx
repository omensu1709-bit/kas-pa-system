/**
 * HeliusEnhancedNode - Helius Enhanced WebSocket signals display
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { SystemNodeWrapper } from './SystemNodeWrapper';
import { useHeliusData } from '../../stores/systemStore';

export const HeliusEnhancedNode = memo(function HeliusEnhancedNode(_props: NodeProps) {
  const helius = useHeliusData();

  return (
    <>
      <Handle type="target" position={Position.Left} />
      
      <SystemNodeWrapper
        title="Helius Enhanced"
        icon="⚡"
        status={helius.status}
        latency={helius.latencyMs}
        lastUpdate={helius.lastUpdate}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* Buy/Sell Ratio */}
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <span style={{
              fontSize: '20px',
              fontWeight: 700,
              color: helius.buySellRatio < 1 ? '#ff4757' : '#00ff88',
              fontFamily: 'monospace'
            }}>
              {(helius.buySellRatio || 1.0).toFixed(2)}
            </span>
            <div style={{ fontSize: '8px', color: '#666', textTransform: 'uppercase' }}>
              Buy/Sell Ratio
            </div>
          </div>

          {/* Signals Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2px',
            fontSize: '9px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Whale Sells</span>
              <span style={{ color: helius.whaleAlert ? '#ff4757' : '#9b59b6' }}>
                {helius.whaleSellCount || 0}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Volume Spike</span>
              <span style={{ color: helius.volumeSpike > 2 ? '#f39c12' : '#3498db' }}>
                {(helius.volumeSpike || 1.0).toFixed(1)}x
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Buy Pressure</span>
              <span style={{ color: '#00ff88' }}>
                {((helius.buyPressure || 0.5) * 100).toFixed(0)}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Whale Vol</span>
              <span style={{ color: '#e74c3c' }}>
                {(helius.whaleSellVolume || 0).toFixed(1)} SOL
              </span>
            </div>
          </div>

          {/* Smart Money Exit Alert */}
          {helius.smartMoneyExit && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '4px',
              background: '#ff475720',
              borderRadius: '4px',
              fontSize: '10px',
              color: '#ff4757',
              fontWeight: 600
            }}>
              SMART MONEY EXIT
            </div>
          )}

          {/* Whale Alert */}
          {helius.whaleAlert && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '4px',
              background: '#ff000020',
              borderRadius: '4px',
              fontSize: '10px',
              color: '#ff0000',
              fontWeight: 600,
              animation: 'pulse 1s infinite'
            }}>
              WHALE ALERT
            </div>
          )}
        </div>
      </SystemNodeWrapper>
      
      <Handle type="source" position={Position.Right} />
    </>
  );
});
