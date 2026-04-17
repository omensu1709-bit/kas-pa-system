/**
 * Fallback-Wrapper für systemStore
 * Dieser Hook überwacht den WebSocket-Status und zeigt eine klare Meldung, wenn
 * das Backend die falsche Version sendet.
 */

import { useEffect, useState } from 'react';
import { useSystemStore } from '../stores/systemStore';

export function useBackendVersionCheck() {
  const [backendVersion, setBackendVersion] = useState<'v3' | 'v4' | 'unknown'>('unknown');
  const lastMessage = useSystemStore((s) => s.lastWebSocketMessage);
  
  useEffect(() => {
    // Wenn wir Nachrichten empfangen, prüfe das Format
    if (lastMessage > 0) {
      const hasV4Data = useSystemStore.getState().ranking.candidatesCount > 0;
      setBackendVersion(hasV4Data ? 'v4' : 'v3');
    }
  }, [lastMessage]);
  
  return backendVersion;
}
