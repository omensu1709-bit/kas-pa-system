/**
 * WebSocketServerNode - WebSocket server status display
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { SystemNodeWrapper } from './SystemNodeWrapper';
import { useWebSocketServerData } from '../../stores/systemStore';

export const WebSocketServerNode = memo(function WebSocketServerNode(_props: NodeProps) {
  const wsServer = useWebSocketServerData();

  return (
    <>
      <Handle type="target" position={Position.Left} />
      
      <SystemNodeWrapper
        title="WebSocket"
        icon="⚡"
        status={wsServer.status}
        latency={wsServer.latencyMs}
        lastUpdate={wsServer.lastUpdate}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Clients */}
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <span style={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#4d96ff',
              fontFamily: 'monospace'
            }}>
              {wsServer.clients}
            </span>
            <div style={{ fontSize: '8px', color: '#666', textTransform: 'uppercase' }}>
              Clients
            </div>
          </div>

          {/* Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px',
            fontSize: '9px'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: '#00ff88', fontFamily: 'monospace' }}>
                {wsServer.blocksDetected.toLocaleString()}
              </span>
              <span style={{ color: '#666', fontSize: '7px' }}>Blocks</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ color: '#9b59b6', fontFamily: 'monospace' }}>
                {wsServer.rpcCalls.toLocaleString()}
              </span>
              <span style={{ color: '#666', fontSize: '7px' }}>RPC</span>
            </div>
          </div>

          {/* Msg/s */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '9px',
            paddingTop: '4px',
            borderTop: '1px solid #1e1e3f'
          }}>
            <span style={{ color: '#888' }}>Msg/s</span>
            <span style={{ color: '#00ff88' }}>
              {(wsServer.messagesPerSecond || 0).toFixed(1)}
            </span>
          </div>
        </div>
      </SystemNodeWrapper>
      
      <Handle type="source" position={Position.Right} />
    </>
  );
});
