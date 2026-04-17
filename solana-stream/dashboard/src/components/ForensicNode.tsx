import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const ForensicNode = memo(({ data }: any) => {
  const color = data.status === 'active' ? '#00ff88' : '#4a5568';
  return (
    <div style={{ padding: 10, borderRadius: 5, background: '#1a1a3a', border: `1px solid ${color}` }}>
      <div style={{ fontWeight: 'bold', color: '#fff' }}>{data.label}</div>
      <div style={{ fontSize: 10, color }}>{data.status}</div>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

export default ForensicNode;
