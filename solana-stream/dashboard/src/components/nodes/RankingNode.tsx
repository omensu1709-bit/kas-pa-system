/**
 * RankingNode - Top short targets ranking display
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { SystemNodeWrapper } from './SystemNodeWrapper';
import { useRankingData } from '../../stores/systemStore';

export const RankingNode = memo(function RankingNode(_props: NodeProps) {
  const ranking = useRankingData();
  const top3 = (ranking.topCandidates || []).slice(0, 3);

  return (
    <>
      <Handle type="target" position={Position.Left} />
      
      <SystemNodeWrapper
        title="Ranking"
        icon="📊"
        status={ranking.status}
        latency={undefined}
        lastUpdate={ranking.lastUpdate}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* Candidates Count */}
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <span style={{
              fontSize: '18px',
              fontWeight: 700,
              color: '#4d96ff',
              fontFamily: 'monospace'
            }}>
              {ranking.candidatesCount || 0}
            </span>
            <div style={{ fontSize: '8px', color: '#666', textTransform: 'uppercase' }}>
              Candidates
            </div>
          </div>

          {/* Top 3 */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            fontSize: '9px'
          }}>
            {top3.map((candidate) => (
              <div key={candidate.symbol} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '2px 4px',
                background: candidate === top3[0] ? '#009E7320' : 'transparent',
                borderRadius: '3px'
              }}>
                <span style={{
                  color: candidate === top3[0] ? '#00ff88' : '#888',
                  fontWeight: candidate === top3[0] ? 700 : 400
                }}>
                  {candidate.symbol}
                </span>
                <span style={{ color: '#ffa502' }}>
                  {(candidate.shortSignalScore || 0).toFixed(1)}
                </span>
              </div>
            ))}
            {top3.length === 0 && (
              <div style={{ color: '#666', textAlign: 'center', fontSize: '9px' }}>
                Waiting for data...
              </div>
            )}
          </div>
        </div>
      </SystemNodeWrapper>
      
      <Handle type="source" position={Position.Right} />
    </>
  );
});
