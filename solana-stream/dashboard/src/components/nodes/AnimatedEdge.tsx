/**
 * AnimatedEdge - Animated connection with particles
 * FIXED: Proper SVG structure for React Flow
 */

import { memo } from 'react';
import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const strokeColor = (style?.stroke as string) || '#4d96ff';
  const strokeWidth = (style?.strokeWidth as number) || 2;

  return (
    <>
      <BaseEdge 
        id={id}
        path={edgePath} 
        style={{
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          strokeOpacity: 0.8
        }}
        markerEnd={markerEnd}
      />
      
      {/* Animated particles */}
      <circle r="3" fill={strokeColor}>
        <animateMotion
          dur="2s"
          repeatCount="indefinite"
          path={edgePath}
        />
        <animate
          attributeName="opacity"
          values="0;1;1;0"
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>
      
      <circle r="2" fill={strokeColor}>
        <animateMotion
          dur="2s"
          repeatCount="indefinite"
          path={edgePath}
          begin="0.5s"
        />
        <animate
          attributeName="opacity"
          values="0;1;1;0"
          dur="2s"
          repeatCount="indefinite"
          begin="0.5s"
        />
      </circle>
    </>
  );
});
