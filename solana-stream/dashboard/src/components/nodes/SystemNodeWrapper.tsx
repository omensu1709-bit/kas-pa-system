/**
 * SystemNodeWrapper - Base wrapper for all system nodes
 * 
 * Provides consistent styling, health indicators, and layout.
 * Wong/Okabe-Ito color palette for colorblind accessibility.
 */

import { memo, type ReactNode } from 'react';

interface SystemNodeWrapperProps {
  title: string;
  icon?: string;
  subtitle?: string;
  status: 'healthy' | 'warning' | 'error';
  latency?: number;
  lastUpdate?: number;
  children: ReactNode;
  className?: string;
  width?: number;
  accentColor?: string;
}

const STATUS_COLORS = {
  healthy: { bg: '#009E73', text: '#ffffff', border: '#00c896' },
  warning: { bg: '#F5A623', text: '#000000', border: '#ffc107' },
  error: { bg: '#D55E00', text: '#ffffff', border: '#ff6b00' }
};

const STATUS_ICONS = {
  healthy: '✓',
  warning: '⚠',
  error: '✕'
};

export const SystemNodeWrapper = memo(function SystemNodeWrapper({
  title,
  icon = '📊',
  subtitle,
  status,
  latency,
  lastUpdate,
  children,
  className = '',
  width,
  accentColor
}: SystemNodeWrapperProps) {
  const colors = STATUS_COLORS[status];
  const statusIcon = STATUS_ICONS[status];
  
  const timeSinceUpdate = lastUpdate ? Math.floor((Date.now() - lastUpdate) / 1000) : null;

  return (
    <div 
      className={`system-node ${className}`}
      style={{
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a3a 100%)',
        border: `2px solid ${accentColor || colors.border}`,
        borderRadius: '12px',
        padding: '12px',
        minWidth: '180px',
        width: width ? `${width}px` : undefined,
        maxWidth: width ? undefined : '220px',
        boxShadow: `0 0 20px ${accentColor || colors.bg}30`
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '8px',
        paddingBottom: '8px',
        borderBottom: '1px solid #1e1e3f'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '16px' }}>{icon}</span>
          <div>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#ffffff',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              {title}
            </span>
            {subtitle && (
              <div style={{
                fontSize: '9px',
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <div style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: colors.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          color: colors.text
        }}>
          {statusIcon}
        </div>
      </div>

      {/* Content */}
      <div style={{ marginBottom: '8px' }}>
        {children}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '10px',
        color: '#666',
        fontFamily: 'monospace'
      }}>
        {latency !== undefined && (
          <span style={{ color: latency > 500 ? '#ff4757' : latency > 200 ? '#ffa502' : '#00ff88' }}>
            {latency}ms
          </span>
        )}
        {timeSinceUpdate !== null && (
          <span style={{ color: timeSinceUpdate > 10 ? '#ff4757' : '#666' }}>
            {timeSinceUpdate}s ago
          </span>
        )}
      </div>
    </div>
  );
});
