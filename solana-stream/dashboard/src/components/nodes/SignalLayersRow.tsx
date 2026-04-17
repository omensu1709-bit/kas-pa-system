/**
 * Signal Layers Row - Visualizes 3 Signal Processing Layers
 * 
 * Shows:
 * - Market Layer (from DexScreener)
 * - OnChain Layer (from Helius)
 * - Network Layer (from Chainstack)
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useSystemStore } from '../../stores/systemStore';
import { SystemNodeWrapper } from './SystemNodeWrapper';

export const SignalLayersRow = memo(() => {
  // In the new system, signals come from different sources
  // For now, we'll use existing data mapped to new concepts
  
  const crashDetection = useSystemStore(s => s.crashDetection);
  const helius = useSystemStore(s => s.helius);
  
  // Map to new signal concepts
  const marketScore = Math.min(1, (crashDetection.confirmingMetrics || 0) / 9);
  const onChainScore = helius.whaleSellVolume > 0 ? Math.min(1, helius.whaleSellVolume / 100) : 0.3;
  const networkScore = 0.5; // Placeholder - chainstack doesn't have direct signal
  
  const getScoreColor = (score: number) => {
    if (score > 0.7) return '#e74c3c'; // Red = high risk
    if (score > 0.5) return '#f5a623'; // Orange = moderate
    return '#009E73'; // Green = low
  };

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      {/* Market Layer */}
      <div style={{ position: 'relative' }}>
        <Handle type="target" position={Position.Left} style={{ background: '#4d96ff' }} />
        <SystemNodeWrapper
          title="Market Layer"
          subtitle="DexScreener"
          status={marketScore > 0.6 ? 'warning' : 'healthy'}
          accentColor="#4d96ff"
        >
          <div style={{ textAlign: 'center', marginTop: '8px' }}>
            <div style={{
              fontSize: '28px',
              fontWeight: 700,
              color: getScoreColor(marketScore)
            }}>
              {(marketScore * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
              Signal Score
            </div>
          </div>

          <div style={{
            marginTop: '12px',
            padding: '8px',
            background: 'rgba(77, 150, 255, 0.1)',
            borderRadius: '6px',
            fontSize: '10px'
          }}>
            <div>Sell Accel: ---</div>
            <div>Buy/Sell: {(helius.buySellRatio || 1).toFixed(2)}</div>
            <div>Volume Spike: {(helius.volumeSpike || 1).toFixed(1)}x</div>
            <div>Liq Drainage: ---</div>
          </div>
        </SystemNodeWrapper>
        <Handle type="source" position={Position.Right} style={{ background: '#4d96ff' }} />
      </div>

      {/* OnChain Layer */}
      <div style={{ position: 'relative' }}>
        <Handle type="target" position={Position.Left} style={{ background: '#9b59b6' }} />
        <SystemNodeWrapper
          title="OnChain Layer"
          subtitle="Helius Enhanced"
          status={helius.whaleAlert ? 'error' : (helius.smartMoneyExit ? 'warning' : 'healthy')}
          accentColor="#9b59b6"
        >
          <div style={{ textAlign: 'center', marginTop: '8px' }}>
            <div style={{
              fontSize: '28px',
              fontWeight: 700,
              color: getScoreColor(onChainScore)
            }}>
              {(onChainScore * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
              Signal Score
            </div>
          </div>

          <div style={{
            marginTop: '12px',
            padding: '8px',
            background: 'rgba(155, 89, 182, 0.1)',
            borderRadius: '6px',
            fontSize: '10px'
          }}>
            <div>Whale Sells: {helius.whaleSellCount || 0}</div>
            <div>Whale Vol: {helius.whaleSellVolume?.toFixed(1) || 0} SOL</div>
            <div>Unique Sellers: ---</div>
            <div style={{ color: helius.whaleAlert ? '#e74c3c' : '#888' }}>
              Alert: {helius.whaleAlert ? 'ACTIVE' : 'None'}
            </div>
          </div>
        </SystemNodeWrapper>
        <Handle type="source" position={Position.Right} style={{ background: '#9b59b6' }} />
      </div>

      {/* Network Layer */}
      <div style={{ position: 'relative' }}>
        <Handle type="target" position={Position.Left} style={{ background: '#00d4ff' }} />
        <SystemNodeWrapper
          title="Network Layer"
          subtitle="Chainstack"
          status="healthy"
          accentColor="#00d4ff"
        >
          <div style={{ textAlign: 'center', marginTop: '8px' }}>
            <div style={{
              fontSize: '28px',
              fontWeight: 700,
              color: getScoreColor(networkScore)
            }}>
              {(networkScore * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
              Signal Score
            </div>
          </div>

          <div style={{
            marginTop: '12px',
            padding: '8px',
            background: 'rgba(0, 212, 255, 0.1)',
            borderRadius: '6px',
            fontSize: '10px'
          }}>
            <div>TX Volume: ---</div>
            <div>Fee Spike: ---</div>
            <div>Block Health: OK</div>
          </div>
        </SystemNodeWrapper>
        <Handle type="source" position={Position.Right} style={{ background: '#00d4ff' }} />
      </div>
    </div>
  );
});

SignalLayersRow.displayName = 'SignalLayersRow';