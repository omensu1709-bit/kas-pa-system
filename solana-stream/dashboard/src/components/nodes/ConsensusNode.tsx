/**
 * Consensus Node - Center Decision Display
 * 
 * Shows:
 * - Consensus score (0-1)
 * - Layers agreeing count
 * - Current decision (IGNORE/MONITOR/SHORT)
 * - Expected drop and timeframe
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useSystemStore } from '../../stores/systemStore';
import { SystemNodeWrapper } from './SystemNodeWrapper';

export const ConsensusNode = memo(() => {
  const crashDetection = useSystemStore(s => s.crashDetection);
  const helius = useSystemStore(s => s.helius);
  const ranking = useSystemStore(s => s.ranking);
  
  // Calculate consensus from available data
  const marketScore = Math.min(1, (crashDetection.confirmingMetrics || 0) / 9);
  const onChainScore = helius.whaleSellVolume > 0 ? Math.min(1, helius.whaleSellVolume / 100) : 0.3;
  
  // Estimate consensus (in real system, this comes from actual calculation)
  const consensus = (marketScore * 0.4 + onChainScore * 0.35 + 0.25 * 0.25);
  const layersAgreeing = marketScore > 0.6 ? 1 : 0;
  
  // Determine decision based on crash probability
  const crashProb = crashDetection.crashProbability / 100;
  let decision: 'IGNORE' | 'MONITOR' | 'SHORT' = 'IGNORE';
  if (crashProb > 0.2) decision = 'SHORT';
  else if (crashProb > 0.1) decision = 'MONITOR';
  
  const decisionColor = {
    IGNORE: '#009E73',
    MONITOR: '#f5a623',
    SHORT: '#e74c3c'
  }[decision];
  
  return (
    <SystemNodeWrapper
      title="Consensus Engine"
      subtitle="Triple Validation"
      status={decision === 'SHORT' ? 'error' : (decision === 'MONITOR' ? 'warning' : 'healthy')}
      accentColor="#ffa502"
      width={280}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#ffa502' }} />
      
      {/* Consensus Score */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <div style={{ fontSize: '12px', color: '#888' }}>Consensus</div>
        <div style={{
          fontSize: '24px',
          fontWeight: 700,
          color: consensus > 0.7 ? '#e74c3c' : (consensus > 0.5 ? '#ffa502' : '#009E73')
        }}>
          {(consensus * 100).toFixed(0)}%
        </div>
      </div>
      
      {/* Layers Agreeing */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px'
      }}>
        <div style={{ fontSize: '12px', color: '#888' }}>Layers Agreeing</div>
        <div style={{
          fontSize: '18px',
          fontWeight: 600,
          color: layersAgreeing >= 2 ? '#009E73' : '#888'
        }}>
          {layersAgreeing}/3
        </div>
      </div>
      
      {/* Decision Badge */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '12px',
        background: `${decisionColor}22`,
        border: `2px solid ${decisionColor}`,
        borderRadius: '8px',
        marginBottom: '12px'
      }}>
        <span style={{
          fontSize: '16px',
          fontWeight: 700,
          color: decisionColor,
          letterSpacing: '1px'
        }}>
          {decision}
        </span>
      </div>
      
      {/* Expected Drop & Timeframe */}
      {decision === 'SHORT' && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          padding: '8px',
          background: 'rgba(255, 165, 2, 0.1)',
          borderRadius: '6px',
          fontSize: '11px'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#888' }}>Expected</div>
            <div style={{ color: '#e74c3c', fontWeight: 600 }}>
              -{((crashProb * 100 * 0.5) || 3.5).toFixed(1)}%
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#888' }}>Timeframe</div>
            <div style={{ color: '#ffa502', fontWeight: 600 }}>5-15min</div>
          </div>
        </div>
      )}
      
      {/* Top Coin Info */}
      {ranking.topCandidates?.[0] && (
        <div style={{
          marginTop: '8px',
          padding: '6px',
          background: 'rgba(255, 165, 2, 0.05)',
          borderRadius: '4px',
          fontSize: '10px',
          textAlign: 'center',
          color: '#888'
        }}>
          Top: {ranking.topCandidates[0].symbol}
        </div>
      )}
      
      <Handle type="source" position={Position.Right} style={{ background: '#ffa502' }} />
    </SystemNodeWrapper>
  );
});

ConsensusNode.displayName = 'ConsensusNode';