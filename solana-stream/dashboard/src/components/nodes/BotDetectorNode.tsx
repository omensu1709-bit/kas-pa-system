/**
 * BotDetectorNode - Bot activity monitoring display
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { SystemNodeWrapper } from './SystemNodeWrapper';
import { useBotDetectorData } from '../../stores/systemStore';

export const BotDetectorNode = memo(function BotDetectorNode(_props: NodeProps) {
  const bot = useBotDetectorData();

  return (
    <>
      <Handle type="target" position={Position.Left} />
      
      <SystemNodeWrapper
        title="Bot Detector"
        icon="🤖"
        status={bot.status}
        latency={undefined}
        lastUpdate={bot.lastUpdate}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {/* Bot Probability */}
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <span style={{
              fontSize: '20px',
              fontWeight: 700,
              color: bot.botProbability > 50 ? '#ff4757' : '#00ff88',
              fontFamily: 'monospace'
            }}>
              {(bot.botProbability || 0).toFixed(1)}%
            </span>
            <div style={{ fontSize: '8px', color: '#666', textTransform: 'uppercase' }}>
              Bot Activity
            </div>
          </div>

          {/* Metrics Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '2px',
            fontSize: '9px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Jito</span>
              <span style={{ color: '#9b59b6' }}>{bot.jitoBundles}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>MEV</span>
              <span style={{ color: '#e74c3c' }}>{bot.mevTxs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Sandwich</span>
              <span style={{ color: '#f39c12' }}>{bot.sandwichCount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Liq.</span>
              <span style={{ color: '#3498db' }}>{bot.liquidationCount}</span>
            </div>
          </div>

          {/* Fees */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '9px',
            paddingTop: '4px',
            borderTop: '1px solid #1e1e3f'
          }}>
            <span style={{ color: '#888' }}>Fees</span>
            <span style={{ color: '#00ff88' }}>
              {((bot.totalFees || 0) / 1e9).toFixed(2)} SOL
            </span>
          </div>
        </div>
      </SystemNodeWrapper>
      
      <Handle type="source" position={Position.Right} />
    </>
  );
});
