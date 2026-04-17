import { memo } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

const ForensicEdge = memo(({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, style }: EdgeProps) => {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <BaseEdge 
      id={id} 
      path={edgePath} 
      style={{ ...style, strokeWidth: data?.status === 'active' ? 3 : 2 }} 
    />
  );
});

export default ForensicEdge;
