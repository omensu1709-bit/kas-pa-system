/**
 * useSystemWebSocket - Custom Hook for KAS PA Forensic Twin
 * 
 * Features for long-term stability:
 * - Auto-reconnect with exponential backoff + jitter
 * - navigator.onLine detection
 * - Stale closure fix via ref pattern
 * - Graceful degradation
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSystemStore, type WebSocketUpdate } from '../stores/systemStore';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RECONNECT_ATTEMPTS = 10;

interface UseSystemWebSocketOptions {
  onMessage?: (data: WebSocketUpdate) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

function getWebSocketURL(): string {
  // CRITICAL: Verwende den Hostnamen aus der Browser-URL
  // Wenn Dashboard über http://IP:5173 aufgerufen wird, dann ws://IP:8080
  // Wenn Dashboard über http://localhost:5173 aufgerufen wird, dann ws://localhost:8080
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const url = `${protocol}//${host}:8080`;
  console.log(`[WS] URL berechnet: ${url} (von Browser-URL: ${window.location.href})`);
  return url;
}

export function useSystemWebSocket(options: UseSystemWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const [wsUrl] = useState(() => getWebSocketURL());
  
  // Store actions
  const setConnectionStatus = useSystemStore((s) => s.setConnectionStatus);
  const updateFromWebSocket = useSystemStore((s) => s.updateFromWebSocket);
  
  // Refs for callbacks (avoid stale closures)
  const optionsRef = useRef(options);
  optionsRef.current = options;
  
  // Calculate reconnect delay with jitter
  const getReconnectDelay = useCallback(() => {
    const baseDelay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)];
    const jitter = Math.random() * 1000;
    return baseDelay + jitter;
  }, []);
  
  // Clear timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);
  
  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    
    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    try {
      console.log(`[WS] Connecting to ${wsUrl} (attempt ${reconnectAttemptRef.current + 1})`);
      setConnectionStatus('reconnecting');
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          console.log('[WS] Connection timeout - closing');
          ws.close();
        }
      }, 5000);
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        
        console.log('[WS] Connected to', wsUrl);
        setConnectionStatus('connected');
        reconnectAttemptRef.current = 0;
        optionsRef.current.onConnect?.();
      };
      
      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data) as WebSocketUpdate;
          
          // Update store with received data
          updateFromWebSocket(data);
          
          // Call user callback
          optionsRef.current.onMessage?.(data);
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };
      
      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        if (!isMountedRef.current) return;
        
        console.log(`[WS] Disconnected (code: ${event.code})`);
        setConnectionStatus('disconnected');
        clearTimers();
        optionsRef.current.onDisconnect?.();
        
        // Auto-reconnect if not intentionally closed
        if (event.code !== 1000 && reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = getReconnectDelay();
          console.log(`[WS] Reconnecting in ${Math.round(delay)}ms...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptRef.current++;
            connect();
          }, delay);
        } else if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[WS] Max reconnect attempts reached');
        }
      };
      
      ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('[WS] Error:', error);
        optionsRef.current.onError?.(error);
      };
      
    } catch (e) {
      console.error('[WS] Failed to create WebSocket:', e);
      setConnectionStatus('disconnected');
    }
  }, [wsUrl, setConnectionStatus, updateFromWebSocket, getReconnectDelay, clearTimers]);
  
  // Disconnect
  const disconnect = useCallback(() => {
    isMountedRef.current = false;
    clearTimers();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
  }, [clearTimers]);
  
  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('[WS] Network online - reconnecting');
      reconnectAttemptRef.current = 0;
      connect();
    };
    
    const handleOffline = () => {
      console.log('[WS] Network offline');
      setConnectionStatus('disconnected');
      clearTimers();
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [connect, clearTimers, setConnectionStatus]);
  
  // Connect on mount
  useEffect(() => {
    isMountedRef.current = true;
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);
  
  // Return connection status directly for convenience
  const connectionStatus = useSystemStore((s) => s.connectionStatus);
  
  return {
    wsUrl,
    connectionStatus,
    connect,
    disconnect,
    isConnected: connectionStatus === 'connected',
    isReconnecting: connectionStatus === 'reconnecting'
  };
}
