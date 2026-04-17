/**
 * BayesianNode - Bayesian Decision Engine
 */

import { Handle, Position } from '@xyflow/react';
import { useSystemStore } from '../../stores/systemStore';

export function BayesianNode({ data: _data }: { data: any }) {
  const paperTrading = useSystemStore((s) => s.paperTrading);
  
  const capital = paperTrading.currentCapital || 100;
  const pnl = paperTrading.totalPnlSol || 0;
  const regime = 'NEUTRAL';
  
  const regimeColors: Record<string, string> = {
    'BULL': '#009E73',
    'BEAR': '#D55E00',
    'HIGH_BOT': '#9b59b6',
    'CRASH_IMMINENT': '#ff4757',
    'NEUTRAL': '#888888'
  };
  
  return (
    <>
    <Handle type="target" position={Position.Left} />
    <div style={{
      background: '#0f0f23',
      border: `2px solid #00d4ff`,
      borderRadius: '12px',
      padding: '16px',
      minWidth: '200px',
      fontFamily: 'monospace',
      boxShadow: '0 0 20px #00d4ff33'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '12px'
      }}>
        <div style={{
          width: '32px',
          height: '32px',
          background: 'linear-gradient(135deg, #00d4ff, #0066aa)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px'
        }}>
          🧠
        </div>
        <div>
          <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>
            Bayesian Engine
          </div>
          <div style={{ color: '#666', fontSize: '9px', textTransform: 'uppercase' }}>
            Brier-Guillotine
          </div>
        </div>
      </div>
      
      {/* Regime Detection */}
      <div style={{
        background: '#1a1a2e',
        borderRadius: '8px',
        padding: '10px',
        textAlign: 'center',
        marginBottom: '10px'
      }}>
        <div style={{ color: '#666', fontSize: '9px', marginBottom: '4px' }}>
          MARKET REGIME
        </div>
        <div style={{ 
          color: regimeColors[regime] || '#888', 
          fontSize: '18px', 
          fontWeight: 700,
          textTransform: 'uppercase'
        }}>
          {regime}
        </div>
      </div>
      
      {/* Decision Factors */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px',
        marginBottom: '10px'
      }}>
        <div style={{
          background: '#1a1a2e',
          borderRadius: '6px',
          padding: '6px 8px'
        }}>
          <div style={{ color: '#666', fontSize: '8px', marginBottom: '2px' }}>
            THRESHOLD
          </div>
          <div style={{ color: '#00d4ff', fontSize: '12px' }}>
            85%
          </div>
        </div>
        <div style={{
          background: '#1a1a2e',
          borderRadius: '6px',
          padding: '6px 8px'
        }}>
          <div style={{ color: '#666', fontSize: '8px', marginBottom: '2px' }}>
            KELLY
          </div>
          <div style={{ color: '#00d4ff', fontSize: '12px' }}>
            Max 25%
          </div>
        </div>
      </div>
      
      {/* Capital & PnL */}
      <div style={{
        background: '#1a1a2e',
        borderRadius: '6px',
        padding: '8px 10px'
      }}>
        <div style={{ color: '#666', fontSize: '9px', marginBottom: '2px' }}>
          CAPITAL
        </div>
        <div style={{ color: '#fff', fontSize: '16px', fontWeight: 600 }}>
          {((capital || 0)).toFixed(1)} SOL
        </div>
        <div style={{ 
          color: pnl >= 0 ? '#009E73' : '#ff4757', 
          fontSize: '11px',
          marginTop: '2px'
        }}>
          {(pnl || 0) >= 0 ? '+' : ''}{(pnl || 0).toFixed(4)} SOL
        </div>
      </div>
      
      {/* Max Positions */}
      <div style={{
        marginTop: '8px',
        display: 'flex',
        gap: '2px'
      }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{
            flex: 1,
            height: '6px',
            borderRadius: '3px',
            background: i < (paperTrading.openPositions || 0) ? '#00d4ff' : '#1a1a2e'
          }} />
        ))}
      </div>
      <div style={{ color: '#555', fontSize: '8px', marginTop: '4px', textAlign: 'center' }}>
        {(paperTrading.openPositions || 0)}/4 Positions
      </div>
    </div>
    <Handle type="source" position={Position.Right} />
    </>
  );
}