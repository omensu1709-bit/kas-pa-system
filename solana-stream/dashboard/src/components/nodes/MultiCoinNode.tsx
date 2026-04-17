/**
 * MultiCoinNode - Multi-Coin Crash Detection Node
 */

import { Handle, Position } from '@xyflow/react';
import { useSystemStore } from '../../stores/systemStore';

export function MultiCoinNode({ data: _data }: { data: any }) {
  const crashDetection = useSystemStore((s) => s.crashDetection);
  const ranking = useSystemStore((s) => s.ranking);
  
  const crashProb = crashDetection.crashProbability || 0;
  const zone = crashDetection.zone || 'IGNORE';
  const confirming = crashDetection.confirmingMetrics || 0;
  const totalMetrics = crashDetection.totalMetrics || 9;
  
  const zoneColors = {
    'IGNORE': '#009E73',
    'MONITOR': '#F5A623',
    'IMMEDIATE_SHORT': '#D55E00'
  };
  const zoneColor = zoneColors[zone] || '#666';
  const topCoin = ranking.topCandidates?.[0];
  
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div style={{
      background: '#0f0f23',
      border: `2px solid #ff4757`,
      borderRadius: '12px',
      padding: '16px',
      minWidth: '220px',
      fontFamily: 'monospace',
      boxShadow: '0 0 20px #ff475733'
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
          background: 'linear-gradient(135deg, #ff4757, #c0392b)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px'
        }}>
          🎯
        </div>
        <div>
          <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>
            Multi-Coin Detection
          </div>
          <div style={{ color: '#666', fontSize: '9px', textTransform: 'uppercase' }}>
            Top 10 Coins
          </div>
        </div>
      </div>
      
      {/* Primary Metric - Crash Probability */}
      <div style={{
        background: '#1a1a2e',
        borderRadius: '8px',
        padding: '12px',
        textAlign: 'center',
        marginBottom: '10px'
      }}>
        <div style={{ color: '#666', fontSize: '9px', marginBottom: '4px' }}>
          CRASH PROBABILITY
        </div>
        <div style={{ 
          color: zoneColor, 
          fontSize: '28px', 
          fontWeight: 700,
          textShadow: `0 0 20px ${zoneColor}`
        }}>
          {(crashProb || 0).toFixed(2)}%
        </div>
        <div style={{
          display: 'inline-block',
          background: zoneColor + '22',
          color: zoneColor,
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '10px',
          marginTop: '4px'
        }}>
          {zone}
        </div>
      </div>
      
      {/* Confirming Metrics */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '10px'
      }}>
        {[...Array(totalMetrics)].map((_, i) => (
          <div key={i} style={{
            flex: 1,
            height: '4px',
            borderRadius: '2px',
            background: i < confirming ? zoneColor : '#1a1a2e'
          }} />
        ))}
      </div>
      
      <div style={{ color: '#666', fontSize: '9px', textAlign: 'center', marginBottom: '8px' }}>
        Confirming: {confirming}/{totalMetrics}
      </div>
      
      {/* Top Coin */}
      {topCoin && (
        <div style={{
          background: '#1a1a2e',
          borderRadius: '6px',
          padding: '8px 10px'
        }}>
          <div style={{ color: '#666', fontSize: '9px', marginBottom: '2px' }}>
            TOP TARGET
          </div>
          <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
            {topCoin.symbol}
          </div>
          <div style={{ color: '#4d96ff', fontSize: '11px' }}>
            Score: {topCoin.shortSignalScore?.toFixed(0) || 0}
          </div>
        </div>
      )}
    </div>
    <Handle type="source" position={Position.Right} />
    </>
  );
}