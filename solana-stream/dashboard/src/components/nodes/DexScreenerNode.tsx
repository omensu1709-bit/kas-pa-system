/**
 * DexScreenerNode - Data Source Node
 */

import { Handle, Position } from '@xyflow/react';
import { useSystemStore } from '../../stores/systemStore';

export function DexScreenerNode({ data: _data }: { data: any }) {
  const ranking = useSystemStore((s) => s.ranking);
  
  const candidatesCount = ranking.candidatesCount || 0;
  const lastUpdate = ranking.lastUpdate ? new Date(ranking.lastUpdate).toLocaleTimeString() : 'Never';
  const isStale = Date.now() - (ranking.lastUpdate || 0) > 60000;
  const statusColor = isStale ? '#F5A623' : '#009E73';
  
  return (
    <>
    <Handle type="target" position={Position.Left} />
    <div style={{
      background: '#0f0f23',
      border: `2px solid ${statusColor}`,
      borderRadius: '12px',
      padding: '16px',
      minWidth: '180px',
      fontFamily: 'monospace',
      boxShadow: `0 0 20px ${statusColor}33`
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
          background: 'linear-gradient(135deg, #009E73, #006644)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '16px'
        }}>
          📊
        </div>
        <div>
          <div style={{ color: '#fff', fontSize: '13px', fontWeight: 600 }}>
            DexScreener
          </div>
          <div style={{ color: '#666', fontSize: '9px', textTransform: 'uppercase' }}>
            Memecoin Filter
          </div>
        </div>
      </div>
      
      {/* Metrics */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        marginTop: '12px'
      }}>
        <div style={{
          background: '#1a1a2e',
          borderRadius: '6px',
          padding: '8px 10px'
        }}>
          <div style={{ color: '#666', fontSize: '9px', marginBottom: '2px' }}>
            CANDIDATES
          </div>
          <div style={{ color: '#4d96ff', fontSize: '20px', fontWeight: 700 }}>
            {candidatesCount > 0 ? Math.round(candidatesCount * 0.4) : '--'}
          </div>
        </div>
        
        <div style={{
          background: '#1a1a2e',
          borderRadius: '6px',
          padding: '8px 10px'
        }}>
          <div style={{ color: '#666', fontSize: '9px', marginBottom: '2px' }}>
            LIQUIDITY FILTER
          </div>
          <div style={{ color: '#888', fontSize: '12px' }}>
            {'>'} $10K
          </div>
        </div>
      </div>
      
      {/* Status */}
      <div style={{
        marginTop: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <div style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: statusColor
        }} />
        <span style={{ color: '#666', fontSize: '9px' }}>
          {lastUpdate}
        </span>
      </div>
    </div>
    <Handle type="source" position={Position.Right} />
    </>
  );
}