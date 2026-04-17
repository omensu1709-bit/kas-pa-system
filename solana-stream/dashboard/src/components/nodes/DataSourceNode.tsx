/**
 * DataSourceNode - Chainstack or Helius data source display
 */

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { SystemNodeWrapper } from './SystemNodeWrapper';
import { SparklineChart } from './SparklineChart';
import { useChainstackData, useHeliusData } from '../../stores/systemStore';

interface DataSourceNodeProps extends NodeProps {
  data: {
    sourceType: 'chainstack' | 'helius';
  };
}

export const DataSourceNode = memo(function DataSourceNode({ data }: DataSourceNodeProps) {
  const chainstack = useChainstackData();
  const helius = useHeliusData();
  
  const nodeData = data.sourceType === 'chainstack' ? chainstack : helius;
  const title = data.sourceType === 'chainstack' ? 'Chainstack' : 'Helius';
  const icon = data.sourceType === 'chainstack' ? '⛓️' : '🔗';

  const metricValue = data.sourceType === 'chainstack' 
    ? chainstack.blocksDetected 
    : helius.rpcCalls;
  const metricLabel = data.sourceType === 'chainstack' ? 'Blocks' : 'RPC Calls';

  return (
    <>
      <Handle type="target" position={Position.Left} />
      
      <SystemNodeWrapper
        title={title}
        icon={icon}
        status={nodeData.status}
        latency={nodeData.latencyMs}
        lastUpdate={nodeData.lastUpdate}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Metric */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
            <span style={{ color: '#888' }}>{metricLabel}</span>
            <span style={{ color: '#00ff88', fontFamily: 'monospace' }}>
              {metricValue.toLocaleString()}
            </span>
          </div>
          
          {/* Sparkline placeholder */}
          <SparklineChart 
            data={[]} 
            width={150} 
            height={25} 
            color="#00ff88" 
          />
        </div>
      </SystemNodeWrapper>
      
      <Handle type="source" position={Position.Right} />
    </>
  );
});
