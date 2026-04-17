/**
 * SparklineChart - uPlot wrapper for forensic twin
 * 
 * High-performance sparkline using uPlot (Canvas).
 * 60fps rendering with minimal CPU overhead.
 */

import { useEffect, useRef, memo } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showAxis?: boolean;
}

export const SparklineChart = memo(function SparklineChart({
  data,
  width = 120,
  height = 30,
  color = '#00ff88',
  showAxis = false
}: SparklineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  // Destroy chart on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  // Create/update chart when data changes
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Only render if we have enough data
    if (data.length < 2) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return;
    }

    // Prepare data: [timestamps, values]
    const timestamps = data.map((_, i) => i);
    const values = data;

    const opts: uPlot.Options = {
      width,
      height,
      padding: [2, 2, 2, 2],
      cursor: { show: false },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: { auto: true }
      },
      axes: [
        { show: showAxis, stroke: '#666', grid: { show: false } },
        { show: showAxis, stroke: '#666', grid: { show: false } }
      ],
      series: [
        {}, // x-axis (index)
        { stroke: color, width: 1.5, fill: `${color}20` } // y-axis series
      ]
    };

    try {
      // If chart exists, just update data
      if (chartRef.current) {
        chartRef.current.setData([timestamps, values]);
      } else {
        // Create new chart
        chartRef.current = new uPlot(opts, [timestamps, values], containerRef.current);
      }
    } catch (e) {
      console.error('[Sparkline] uPlot error:', e);
    }
  }, [data, width, height, color, showAxis]);

  // Show placeholder until we have enough data
  if (data.length < 2) {
    return (
      <div 
        ref={containerRef}
        style={{ 
          width, 
          height, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: '#0a0a1a',
          borderRadius: '4px',
          fontSize: '8px',
          color: '#666',
          fontFamily: 'monospace'
        }}
      >
        Collecting...
      </div>
    );
  }

  return <div ref={containerRef} style={{ width, height }} />;
});
