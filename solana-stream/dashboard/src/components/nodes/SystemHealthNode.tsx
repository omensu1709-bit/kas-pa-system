/**
 * SystemHealthNode - Complete System Health Dashboard Node
 * 
 * Displays ALL critical system components with:
 * - Health status per data source (Chainstack, Helius, DexScreener)
 * - Latency per module
 * - Data freshness indicators
 * - Connection status
 * - Error detection and alerting
 */

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { SystemNodeWrapper } from './SystemNodeWrapper';
import { useSystemStore } from '../../stores/systemStore';

interface ModuleHealth {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  latency: number;
  lastUpdate: number;
  blocks?: number;
  rpcCalls?: number;
}

export const SystemHealthNode = memo(function SystemHealthNode() {
  const chainstack = useSystemStore(s => s.chainstack);
  const helius = useSystemStore(s => s.helius);
  const ranking = useSystemStore(s => s.ranking);
  const paperTrading = useSystemStore(s => s.paperTrading);
  const webSocketServer = useSystemStore(s => s.webSocketServer);
  const connectionStatus = useSystemStore(s => s.connectionStatus);
  
  // Build module list
  const modules: ModuleHealth[] = [
    {
      name: 'Chainstack RPC',
      status: chainstack.status,
      latency: chainstack.latencyMs,
      lastUpdate: chainstack.lastUpdate,
      blocks: chainstack.blocksDetected
    },
    {
      name: 'Helius RPC',
      status: helius.status,
      latency: helius.latencyMs,
      lastUpdate: helius.lastUpdate,
      rpcCalls: helius.rpcCalls
    },
    {
      name: 'Ranking Service',
      status: ranking.status,
      latency: 0,
      lastUpdate: ranking.lastUpdate
    },
    {
      name: 'Paper Trading',
      status: paperTrading.status,
      latency: 0,
      lastUpdate: paperTrading.lastUpdate
    },
    {
      name: 'WebSocket Server',
      status: webSocketServer.status,
      latency: webSocketServer.latencyMs,
      lastUpdate: webSocketServer.lastUpdate
    }
  ];
  
  // Calculate system-wide health
  const errorCount = modules.filter(m => m.status === 'error').length;
  const warningCount = modules.filter(m => m.status === 'warning').length;
  const overallStatus = errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'healthy';
  
  // Data freshness calculation
  const now = Date.now();
  const getFreshness = (lastUpdate: number) => {
    if (!lastUpdate) return 'unknown';
    const seconds = Math.floor((now - lastUpdate) / 1000);
    if (seconds < 5) return 'fresh';
    if (seconds < 30) return 'stale';
    return 'dead';
  };
  
  const freshnessColor = (freshness: string) => {
    switch (freshness) {
      case 'fresh': return '#00ff88';
      case 'stale': return '#ffa502';
      case 'dead': return '#ff4757';
      default: return '#666';
    }
  };
  
  const freshnessText = (lastUpdate: number) => {
    if (!lastUpdate) return 'Never';
    const seconds = Math.floor((now - lastUpdate) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };
  
  return (
    <>
      <Handle type="target" position={Position.Left} style={{ background: '#00d4ff' }} />
      
      <SystemNodeWrapper
        title="System Health"
        icon="🏥"
        subtitle="All Modules"
        status={overallStatus}
        accentColor={errorCount > 0 ? '#ff4757' : warningCount > 0 ? '#ffa502' : '#00ff88'}
        width={320}
      >
        {/* Connection Status Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px',
          marginBottom: '10px',
          background: connectionStatus === 'connected' 
            ? 'rgba(0, 255, 136, 0.1)' 
            : connectionStatus === 'reconnecting'
              ? 'rgba(255, 165, 2, 0.1)'
              : 'rgba(255, 71, 87, 0.1)',
          borderRadius: '6px',
          border: `1px solid ${connectionStatus === 'connected' ? '#00ff88' : connectionStatus === 'reconnecting' ? '#ffa502' : '#ff4757'}40`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: connectionStatus === 'connected' ? '#00ff88' : connectionStatus === 'reconnecting' ? '#ffa502' : '#ff4757',
              boxShadow: `0 0 8px ${connectionStatus === 'connected' ? '#00ff88' : connectionStatus === 'reconnecting' ? '#ffa502' : '#ff4757'}`
            }} />
            <span style={{ fontSize: '11px', color: '#888' }}>WebSocket</span>
          </div>
          <span style={{ 
            fontSize: '12px', 
            fontWeight: 600,
            color: connectionStatus === 'connected' ? '#00ff88' : connectionStatus === 'reconnecting' ? '#ffa502' : '#ff4757'
          }}>
            {connectionStatus.toUpperCase()}
          </span>
        </div>
        
        {/* Module List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {modules.map((module, idx) => {
            const freshness = getFreshness(module.lastUpdate);
            return (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 8px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '4px',
                border: `1px solid ${module.status === 'error' ? '#ff475740' : module.status === 'warning' ? '#ffa50240' : 'transparent'}`
              }}>
                {/* Module Name & Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: module.status === 'error' ? '#ff4757' : module.status === 'warning' ? '#ffa502' : '#00ff88'
                  }} />
                  <span style={{ fontSize: '10px', color: '#aaa' }}>{module.name}</span>
                </div>
                
                {/* Metrics */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Latency */}
                  {module.latency > 0 && (
                    <span style={{ 
                      fontSize: '9px', 
                      color: module.latency > 500 ? '#ff4757' : module.latency > 200 ? '#ffa502' : '#00ff88',
                      fontFamily: 'monospace'
                    }}>
                      {module.latency}ms
                    </span>
                  )}
                  
                  {/* Block/RPC count */}
                  {(module.blocks !== undefined || module.rpcCalls !== undefined) && (
                    <span style={{ fontSize: '9px', color: '#666', fontFamily: 'monospace' }}>
                      {module.blocks !== undefined ? `${module.blocks} blk` : `${module.rpcCalls} rpc`}
                    </span>
                  )}
                  
                  {/* Freshness */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ 
                      fontSize: '9px', 
                      color: freshnessColor(freshness),
                      fontFamily: 'monospace'
                    }}>
                      {freshnessText(module.lastUpdate)}
                    </span>
                    <span style={{ fontSize: '8px' }}>
                      {freshness === 'fresh' ? '●' : freshness === 'stale' ? '◐' : '○'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Error Summary */}
        {errorCount > 0 && (
          <div style={{
            marginTop: '10px',
            padding: '8px',
            background: 'rgba(255, 71, 87, 0.1)',
            borderRadius: '6px',
            border: '1px solid #ff475740'
          }}>
            <div style={{ fontSize: '10px', color: '#ff4757', fontWeight: 600 }}>
              ⚠ {errorCount} ERROR{errorCount > 1 ? 'S' : ''} DETECTED
            </div>
            <div style={{ fontSize: '9px', color: '#888', marginTop: '4px' }}>
              {modules.filter(m => m.status === 'error').map(m => m.name).join(', ')}
            </div>
          </div>
        )}
        
        {warningCount > 0 && (
          <div style={{
            marginTop: '6px',
            padding: '6px',
            background: 'rgba(255, 165, 2, 0.1)',
            borderRadius: '4px',
            fontSize: '9px',
            color: '#ffa502'
          }}>
            {warningCount} warning{warningCount > 1 ? 's' : ''}: {modules.filter(m => m.status === 'warning').map(m => m.name).join(', ')}
          </div>
        )}
      </SystemNodeWrapper>
      
      <Handle type="source" position={Position.Right} style={{ background: '#00d4ff' }} />
    </>
  );
});

SystemHealthNode.displayName = 'SystemHealthNode';