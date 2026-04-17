/**
 * Perspective Dashboard - Real-time Visual Twin
 * Nutzt @finos/perspective v3.x für high-performance Streaming Data Grid
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface PredictionRecord {
  timestamp: string;
  symbol: string;
  price: number;
  crashProbability: number;
  zone: 'IGNORE' | 'MONITOR' | 'IMMEDIATE_SHORT';
  confidence: number;
  latency_ms: number;
  botProbability: number;
  regimeType: string;
  networkFee: number;
  priorityFee: number;
  slot: number;
  // Hawkes metrics
  n?: number;
  PE?: number;
  kappa?: number;
  fragmentation?: number;
  rt?: number;
  bValue?: number;
  CTE?: number;
  SSI?: number;
  LFI?: number;
  // Wallet metrics
  walletAge?: number;
  volume24h?: number;
  shortSignalScore?: number;
}

interface PerspectiveSchema {
  timestamp: 'datetime';
  symbol: 'string';
  price: 'float';
  crashProbability: 'float';
  zone: 'string';
  confidence: 'float';
  latency_ms: 'float';
  botProbability: 'float';
  regimeType: 'string';
  networkFee: 'float';
  priorityFee: 'float';
  slot: 'integer';
  n: 'float';
  PE: 'float';
  kappa: 'float';
  fragmentation: 'float';
  rt: 'float';
  bValue: 'float';
  CTE: 'float';
  SSI: 'float';
  LFI: 'float';
  walletAge: 'float';
  volume24h: 'float';
  shortSignalScore: 'float';
}

interface DashboardConfig {
  maxRows: number;
  updateInterval: number;
  theme: 'dark' | 'light';
  showCharts: boolean;
  enableExport: boolean;
}

interface PerspectiveWorkerInstance {
  table: (schema: Record<string, string>) => Promise<PerspectiveTableInstance>;
  view: (config?: ViewConfig) => Promise<PerspectiveViewInstance>;
}

interface PerspectiveTableInstance {
  update: (data: Record<string, any>[]) => void;
  clear: () => Promise<void>;
  delete: () => Promise<void>;
  num_rows: () => Promise<number>;
  schema: () => Promise<Record<string, string>>;
}

interface PerspectiveViewInstance {
  num_rows: () => Promise<number>;
  schema: () => Promise<Record<string, string>>;
  to_columns: () => Promise<any[]>;
  to_json: () => Promise<any[]>;
}

interface ViewConfig {
  columns?: string[];
  rows?: string[];
  aggregates?: Record<string, string>;
  sort?: [string, 'asc' | 'desc'][];
  filter?: [string, string, any][];
  group_by?: string[];
  split_by?: string[];
  format?: Record<string, string>;
}

// ============================================================================
// PERSPECTIVE SCHEMA
// ============================================================================

const PERSPECTIVE_SCHEMA: PerspectiveSchema = {
  timestamp: 'datetime',
  symbol: 'string',
  price: 'float',
  crashProbability: 'float',
  zone: 'string',
  confidence: 'float',
  latency_ms: 'float',
  botProbability: 'float',
  regimeType: 'string',
  networkFee: 'float',
  priorityFee: 'float',
  slot: 'integer',
  n: 'float',
  PE: 'float',
  kappa: 'float',
  fragmentation: 'float',
  rt: 'float',
  bValue: 'float',
  CTE: 'float',
  SSI: 'float',
  LFI: 'float',
  walletAge: 'float',
  volume24h: 'float',
  shortSignalScore: 'float',
};

// ============================================================================
// PERSPECTIVE HOOK
// ============================================================================

interface UsePerspectiveReturn {
  isLoaded: boolean;
  isInitialized: boolean;
  error: string | null;
  rowCount: number;
  worker: PerspectiveWorkerInstance | null;
  table: PerspectiveTableInstance | null;
  viewerElement: HTMLElement | null;
  loadTable: (data: Record<string, any>[]) => Promise<void>;
  updateTable: (data: Record<string, any>[]) => void;
  clearTable: () => Promise<void>;
  reset: () => void;
}

function usePerspective(_config: DashboardConfig): UsePerspectiveReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(0);
  const [worker, setWorker] = useState<PerspectiveWorkerInstance | null>(null);
  const [table, setTable] = useState<PerspectiveTableInstance | null>(null);
  const viewerRef = useRef<HTMLElement | null>(null);
  const tableRef = useRef<PerspectiveTableInstance | null>(null);
  const workerRef = useRef<PerspectiveWorkerInstance | null>(null);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize Perspective.js
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        console.log('[Perspective] Initializing...');

        // Step 1: Load CSS
        await import('@finos/perspective-viewer/dist/css/pro.css');
        console.log('[Perspective] CSS loaded');

        // Step 2: Load modules dynamically
        const [perspectiveModule, _viewerModule] = await Promise.all([
          import('@finos/perspective'),
          import('@finos/perspective-viewer'),
        ]);

        console.log('[Perspective] Modules loaded:', {
          perspective: !!perspectiveModule,
        });

        // Step 3: Load plugins
        await Promise.all([
          import('@finos/perspective-viewer-datagrid'),
          import('@finos/perspective-viewer-d3fc'),
        ]);
        console.log('[Perspective] Plugins loaded');

        // Step 4: Wait for custom element with timeout
        if (!mounted) return;

        const waitForElement = new Promise<void>((resolve, reject) => {
          initTimeoutRef.current = setTimeout(() => {
            reject(new Error('Timeout waiting for perspective-viewer custom element'));
          }, 15000);

          customElements.whenDefined('perspective-viewer').then(() => {
            if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
            console.log('[Perspective] Custom element registered');
            resolve();
          }).catch(err => {
            if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
            reject(err);
          });
        });

        await waitForElement;

        if (!mounted) return;

        // Step 5: Create worker
        const perspective = perspectiveModule.default || perspectiveModule;
        const workerInstance = await perspective.worker();

        workerRef.current = workerInstance as unknown as PerspectiveWorkerInstance;
        setWorker(workerRef.current);

        console.log('[Perspective] Worker created');

        // Step 6: Create table
        const tableInstance = await workerInstance.table(PERSPECTIVE_SCHEMA) as unknown as PerspectiveTableInstance;
        tableRef.current = tableInstance;
        setTable(tableInstance);

        console.log('[Perspective] Table created with schema');

        setIsInitialized(true);
        setIsLoaded(true);
        console.log('[Perspective] Initialization complete');

      } catch (err) {
        console.error('[Perspective] Initialization error:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      }
    };

    init();

    return () => {
      mounted = false;
      if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
    };
  }, []);

  // Load initial data
  const loadTable = useCallback(async (data: Record<string, any>[]) => {
    if (!tableRef.current || !isLoaded) return;

    try {
      // Clear existing data
      await tableRef.current.clear();

      // Update with new data
      if (data.length > 0) {
        tableRef.current.update(data);

        const count = await tableRef.current.num_rows();
        setRowCount(count);
        console.log(`[Perspective] Loaded ${count} rows`);
      }
    } catch (err) {
      console.error('[Perspective] Load error:', err);
    }
  }, [isLoaded]);

  // Update table with new data
  const updateTable = useCallback((data: Record<string, any>[]) => {
    if (!tableRef.current || !isLoaded || data.length === 0) return;

    try {
      tableRef.current.update(data);

      // Update row count
      tableRef.current.num_rows().then(count => {
        setRowCount(count);
      }).catch(() => {});
    } catch (err) {
      console.error('[Perspective] Update error:', err);
    }
  }, [isLoaded]);

  // Clear table
  const clearTable = useCallback(async () => {
    if (!tableRef.current) return;

    try {
      await tableRef.current.clear();
      setRowCount(0);
    } catch (err) {
      console.error('[Perspective] Clear error:', err);
    }
  }, []);

  // Reset
  const reset = useCallback(() => {
    if (tableRef.current) {
      tableRef.current.clear().catch(() => {});
    }
    setRowCount(0);
    setError(null);
  }, []);

  return {
    isLoaded,
    isInitialized,
    error,
    rowCount,
    worker,
    table,
    viewerElement: viewerRef.current,
    loadTable,
    updateTable,
    clearTable,
    reset,
  };
}

// ============================================================================
// PERSPECTIVE VIEWER COMPONENT
// ============================================================================

interface PerspectiveViewerComponentProps {
  data: Record<string, any>[];
  className?: string;
  onError?: (error: string) => void;
  onLoad?: () => void;
}

const PerspectiveViewerComponent: React.FC<PerspectiveViewerComponentProps> = ({
  data,
  className = '',
  onError,
  onLoad,
}) => {
  const viewerRef = useRef<HTMLElement>(null);
  const perspective = usePerspective({ maxRows: 10000, updateInterval: 100, theme: 'dark', showCharts: true, enableExport: true });
  const [isViewerReady, setIsViewerReady] = useState(false);

  // Viewer configuration
  const viewerConfig = useMemo(() => ({
    view: 'grid',
    plugin: 'datagrid',
    'row-pivots': '[]',
    'column-pivots': '[]',
    aggregates: JSON.stringify({
      crashProbability: 'avg',
      price: 'last',
      latency_ms: 'avg',
      botProbability: 'avg',
      networkFee: 'avg',
      priorityFee: 'avg',
      n: 'avg',
      PE: 'avg',
      kappa: 'avg',
      fragmentation: 'avg',
      rt: 'avg',
      bValue: 'avg',
      CTE: 'avg',
      SSI: 'avg',
      LFI: 'avg',
    }),
    columns: JSON.stringify([
      'timestamp',
      'symbol',
      'price',
      'crashProbability',
      'zone',
      'confidence',
      'latency_ms',
      'botProbability',
      'regimeType',
      'networkFee',
      'priorityFee',
      'n',
      'PE',
      'kappa',
      'fragmentation',
      'rt',
      'bValue',
      'CTE',
      'SSI',
      'LFI',
    ]),
    sort: JSON.stringify([['timestamp', 'desc']]),
    expressions: JSON.stringify([[
      ' Crash Signal',
      'when("zone" == \'IMMEDIATE_SHORT\', 1, 0)'
    ]]),
  }), []);

  // Connect viewer to table when both are ready
  useEffect(() => {
    if (!perspective.isLoaded || !viewerRef.current || !perspective.table) return;

    let mounted = true;

    const connectViewer = async () => {
      try {
        console.log('[PerspectiveViewer] Connecting to table...');

        // @ts-ignore - load exists on custom element
        await viewerRef.current.load(perspective.table);

        // Apply configuration
        Object.entries(viewerConfig).forEach(([key, value]) => {
          try {
            // @ts-ignore
            viewerRef.current[key] = value;
          } catch (e) {
            console.warn(`[PerspectiveViewer] Config key "${key}" failed:`, e);
          }
        });

        if (mounted) {
          setIsViewerReady(true);
          onLoad?.();
          console.log('[PerspectiveViewer] Connected and configured');
        }
      } catch (err) {
        console.error('[PerspectiveViewer] Connection error:', err);
        onError?.(err instanceof Error ? err.message : 'Connection failed');
      }
    };

    connectViewer();

    return () => {
      mounted = false;
    };
  }, [perspective.isLoaded, perspective.table, viewerConfig, onError, onLoad]);

  // Update data when it changes
  useEffect(() => {
    if (!perspective.isLoaded || !data.length) return;

    perspective.updateTable(data);
  }, [data, perspective.isLoaded, perspective.updateTable]);

  if (perspective.error) {
    return (
      <div className={`bg-red-900/30 border border-red-700 rounded-lg p-6 ${className}`}>
        <div className="text-red-400 font-bold text-lg mb-2">Perspective.js Fehler</div>
        <div className="text-red-300 text-sm font-mono mb-4">{perspective.error}</div>
        <div className="text-gray-400 text-sm">
          Bitte lade die Seite neu oder prüfe die Browser Console für Details.
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-white text-sm"
        >
          Seite neu laden
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Loading overlay */}
      {!perspective.isLoaded && (
        <div className="absolute inset-0 bg-gray-900/90 flex items-center justify-center z-20 rounded-lg">
          <div className="text-center">
            <div className="animate-spin text-5xl mb-4">⚡</div>
            <div className="text-gray-300 text-lg">Perspective.js wird geladen...</div>
            <div className="text-gray-500 text-sm mt-2">WASM Initialisierung</div>
          </div>
        </div>
      )}

      {/* Viewer element */}
      <div className="h-full w-full border border-gray-700 rounded-lg overflow-hidden bg-gray-950">
        <perspective-viewer
          ref={viewerRef}
          class="w-full h-full"
          style={{ height: '100%', minHeight: '400px' }}
        />
      </div>

      {/* Status bar */}
      <div className="absolute bottom-2 right-2 flex items-center gap-3">
        <div className="bg-gray-900/90 px-3 py-1.5 rounded text-xs text-gray-400">
          {perspective.rowCount.toLocaleString()} rows
        </div>
        {isViewerReady && (
          <div className="bg-green-900/90 px-3 py-1.5 rounded text-xs text-green-400">
            ● LIVE
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// METRICS SUMMARY COMPONENT
// ============================================================================

interface MetricsSummaryProps {
  data: PredictionRecord[];
}

const MetricsSummary: React.FC<MetricsSummaryProps> = ({ data }) => {
  const stats = useMemo(() => {
    if (data.length === 0) {
      return {
        avgCrashProb: 0,
        maxCrashProb: 0,
        avgLatency: 0,
        avgBotProb: 0,
        zoneCounts: { IGNORE: 0, MONITOR: 0, IMMEDIATE_SHORT: 0 },
        priceRange: { min: 0, max: 0 },
      };
    }

    const crashProbs = data.map(d => d.crashProbability);
    const latencies = data.map(d => d.latency_ms);
    const botProbs = data.map(d => d.botProbability);
    const prices = data.map(d => d.price);

    const zoneCounts = data.reduce((acc, d) => {
      acc[d.zone] = (acc[d.zone] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      avgCrashProb: crashProbs.reduce((a, b) => a + b, 0) / crashProbs.length,
      maxCrashProb: Math.max(...crashProbs),
      avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      avgBotProb: botProbs.reduce((a, b) => a + b, 0) / botProbs.length,
      zoneCounts,
      priceRange: {
        min: Math.min(...prices.filter(p => p > 0)),
        max: Math.max(...prices.filter(p => p > 0)),
      },
    };
  }, [data]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Avg Crash Probability */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <div className="text-xs text-gray-400 mb-1">Avg Crash Prob</div>
        <div className={`text-2xl font-bold ${
          stats.avgCrashProb > 0.2 ? 'text-red-400' :
          stats.avgCrashProb > 0.1 ? 'text-yellow-400' : 'text-green-400'
        }`}>
          {(stats.avgCrashProb * 100).toFixed(2)}%
        </div>
      </div>

      {/* Max Crash Probability */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <div className="text-xs text-gray-400 mb-1">Max Crash Prob</div>
        <div className={`text-2xl font-bold ${
          stats.maxCrashProb > 0.2 ? 'text-red-400' :
          stats.maxCrashProb > 0.1 ? 'text-yellow-400' : 'text-green-400'
        }`}>
          {(stats.maxCrashProb * 100).toFixed(2)}%
        </div>
      </div>

      {/* Avg Latency */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <div className="text-xs text-gray-400 mb-1">Avg Latenz</div>
        <div className="text-2xl font-bold text-blue-400">
          {stats.avgLatency.toFixed(0)}ms
        </div>
      </div>

      {/* Avg Bot Probability */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
        <div className="text-xs text-gray-400 mb-1">Avg Bot Prob</div>
        <div className="text-2xl font-bold text-purple-400">
          {(stats.avgBotProb * 100).toFixed(1)}%
        </div>
      </div>

      {/* Zone Distribution */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 col-span-2">
        <div className="text-xs text-gray-400 mb-2">Zone Distribution</div>
        <div className="flex h-3 rounded overflow-hidden bg-gray-700">
          <div
            className="bg-green-600 transition-all"
            style={{ width: `${(stats.zoneCounts.IGNORE / data.length) * 100 || 0}%` }}
          />
          <div
            className="bg-yellow-600 transition-all"
            style={{ width: `${(stats.zoneCounts.MONITOR / data.length) * 100 || 0}%` }}
          />
          <div
            className="bg-red-600 transition-all"
            style={{ width: `${(stats.zoneCounts.IMMEDIATE_SHORT / data.length) * 100 || 0}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>IGNORE: {stats.zoneCounts.IGNORE}</span>
          <span>MONITOR: {stats.zoneCounts.MONITOR}</span>
          <span>SHORT: {stats.zoneCounts.IMMEDIATE_SHORT}</span>
        </div>
      </div>

      {/* Price Range */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 col-span-2">
        <div className="text-xs text-gray-400 mb-1">SOL Price Range</div>
        <div className="text-2xl font-bold text-yellow-400">
          ${stats.priceRange.min.toFixed(2)} - ${stats.priceRange.max.toFixed(2)}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

interface PerspectiveDashboardProps {
  initialData?: PredictionRecord[];
  onDataUpdate?: (data: PredictionRecord[]) => void;
  config?: Partial<DashboardConfig>;
}

export const PerspectiveDashboard: React.FC<PerspectiveDashboardProps> = ({
  initialData = [],
  config,
}) => {
  const [data, setData] = useState<PredictionRecord[]>(initialData);
  const [showCharts, setShowCharts] = useState(config?.showCharts ?? true);
  const maxRows = config?.maxRows ?? 10000;

  // Add new data
  const addData = useCallback((newRecords: PredictionRecord[]) => {
    setData(prev => {
      const updated = [...prev, ...newRecords];
      // Keep only last maxRows
      if (updated.length > maxRows) {
        return updated.slice(-maxRows);
      }
      return updated;
    });
  }, [maxRows]);

  // Clear all data
  const clearData = useCallback(() => {
    setData([]);
  }, []);

  // Export data
  const exportCSV = useCallback(() => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row =>
      Object.values(row).map(v =>
        typeof v === 'string' ? `"${v}"` : v
      ).join(',')
    );

    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `kas-pa-data-${Date.now()}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-500 bg-clip-text text-transparent">
              KAS PA Perspective Dashboard
            </h1>
            <p className="text-sm text-gray-400">Real-time Visual Twin | @finos/perspective v3.x</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCharts(!showCharts)}
              className={`px-4 py-2 rounded-lg text-sm ${
                showCharts ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'
              }`}
            >
              {showCharts ? 'Charts ON' : 'Charts OFF'}
            </button>
            <button
              onClick={exportCSV}
              disabled={data.length === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm"
            >
              Export CSV
            </button>
            <button
              onClick={clearData}
              disabled={data.length === 0}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm"
            >
              Clear
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {/* Metrics Summary */}
        <MetricsSummary data={data} />

        {/* Perspective Viewer */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-lg font-semibold">Streaming Data Grid</h2>
            <p className="text-xs text-gray-400">
              High-performance data visualization powered by Perspective.js WASM
            </p>
          </div>
          <div className="p-4" style={{ height: '600px' }}>
            <PerspectiveViewerComponent
              data={data}
              className="h-full"
              onLoad={() => console.log('[Dashboard] Perspective loaded')}
              onError={(err) => console.error('[Dashboard] Perspective error:', err)}
            />
          </div>
        </div>

        {/* Data Info */}
        <div className="mt-6 bg-gray-900 rounded-xl border border-gray-800 p-4">
          <h3 className="text-lg font-semibold mb-3">Perspective.js Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-purple-400 font-bold mb-1">60fps UI Performance</div>
              <div className="text-gray-400">
                Alle Berechnungen finden im WASM-Worker statt - der Main Thread bleibt für
                flüssige UI frei.
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-purple-400 font-bold mb-1">Streaming Updates</div>
              <div className="text-gray-400">
                Millionen von Datenpunkten in Echtzeit streamen ohne Performance-Verlust.
                Blazingly fast.
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="text-purple-400 font-bold mb-1">Interaktive Analyse</div>
              <div className="text-gray-400">
                Sortieren, Filtern, Gruppieren direkt im Grid. Berechnungen in Echtzeit.
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default PerspectiveDashboard;
export { PerspectiveDashboard, PerspectiveViewerComponent, MetricsSummary, usePerspective };
