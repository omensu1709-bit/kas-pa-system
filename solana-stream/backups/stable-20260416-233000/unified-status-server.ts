/**
 * KAS PA v4.2 - Unified Status Server
 *
 * SOTA Monitoring Solution:
 * - HTTP REST API für Metriken
 * - SSE (Server-Sent Events) für Echtzeit-Updates
 * - HTML Dashboard das überall funktioniert
 *
 * Nutzung: npx tsx src/unified-status-server.ts
 */

import * as http from 'http';
import WebSocket from 'ws';

const CONFIG = {
  HTTP_PORT: 3000,
  WS_BACKEND_URL: 'ws://localhost:8080',
  WS_RECONNECT_DELAY: 5000,
  SSE_HEARTBEAT_INTERVAL: 30000,
  MAX_TRACE_HISTORY: 100
};

interface BackendUpdate {
  type: string;
  timestamp: number;
  backendHealth?: { uptimeSeconds: number; memoryUsageMB: number; cycleNumber: number };
  performance?: { currentCapital: number; totalPnlSol: number; winRate: number; totalTrades: number; openPositions: number };
  latestPrediction?: { crashProbability: number; zone: string; confirmingMetrics: number; rawMetrics?: Record<string, number> };
  telemetry?: { traceId: string; propagationTimeMs: number; nodeLatencies: Record<string, any>; lastTrace: any };
  [key: string]: any;
}

interface TraceEntry {
  traceId: string;
  timestamp: number;
  propagationTimeMs: number;
  nodes: Array<{ nodeId: string; latencyMs: number }>;
  success: boolean;
}

let latestData: BackendUpdate | null = null;
let traceHistory: TraceEntry[] = [];
let wsConnected = false;
let lastWsMessage = 0;

const sseClients = new Set<http.ServerResponse>();
let backendWs: WebSocket | null = null;

function updateTraceHistory(telemetry: BackendUpdate['telemetry']): void {
  if (!telemetry) return;

  const entry: TraceEntry = {
    traceId: telemetry.traceId || 'unknown',
    timestamp: telemetry.timestamp || Date.now(),
    propagationTimeMs: telemetry.propagationTimeMs || 0,
    nodes: telemetry.nodeLatencies
      ? Object.entries(telemetry.nodeLatencies).map(([nodeId, data]: [string, any]) => ({ nodeId, latencyMs: data.avgLatencyMs || 0 }))
      : [],
    success: telemetry.lastTrace?.success !== false
  };

  traceHistory.unshift(entry);
  if (traceHistory.length > CONFIG.MAX_TRACE_HISTORY) traceHistory.pop();
}

function broadcastSSE(event: string, data: any): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(message); } catch { sseClients.delete(client); }
  }
}

function sendSSEHeartbeat(): void {
  const heartbeat = `event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try { client.write(heartbeat); } catch { sseClients.delete(client); }
  }
}

function connectToBackend(): void {
  console.log(`[UnifiedStatus] Connecting to backend at ${CONFIG.WS_BACKEND_URL}...`);
  backendWs = new WebSocket(CONFIG.WS_BACKEND_URL);

  backendWs.on('open', () => {
    console.log('[UnifiedStatus] Connected to backend WebSocket');
    wsConnected = true;
    broadcastSSE('status', { type: 'connected', source: 'backend' });
  });

  backendWs.on('message', (data: WebSocket.RawData) => {
    try {
      const message = JSON.parse(data.toString());
      lastWsMessage = Date.now();
      latestData = message;
      if (message.telemetry) updateTraceHistory(message.telemetry);
      broadcastSSE('update', message);
    } catch {}
  });

  backendWs.on('close', (code, reason) => {
    console.log(`[UnifiedStatus] Backend WebSocket closed: code=${code}`);
    wsConnected = false;
    broadcastSSE('status', { type: 'disconnected', source: 'backend' });
    setTimeout(connectToBackend, CONFIG.WS_RECONNECT_DELAY);
  });

  backendWs.on('error', (error) => {
    console.error('[UnifiedStatus] Backend WebSocket error:', error.message);
    wsConnected = false;
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url || '';

  // SSE Endpoint
  if (url === '/events' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`event: connected\ndata: ${JSON.stringify({ status: 'ok', timestamp: Date.now() })}\n\n`);
    if (latestData) res.write(`event: update\ndata: ${JSON.stringify(latestData)}\n\n`);
    sseClients.add(res);
    req.on('close', () => { sseClients.delete(res); });
    return;
  }

  // Health Endpoint
  if (url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: wsConnected ? 'healthy' : 'degraded', uptime: process.uptime(), memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 10) / 10, wsConnected, lastWsMessage: lastWsMessage ? Date.now() - lastWsMessage : null, sseClients: sseClients.size, traceHistorySize: traceHistory.length }));
    return;
  }

  // Metrics Endpoint (Prometheus-format)
  if (url === '/metrics' && req.method === 'GET') {
    const lines: string[] = [];
    if (latestData?.backendHealth) {
      lines.push(`# HELP kaspa_uptime_seconds Backend uptime in seconds\n# TYPE kaspa_uptime_seconds counter\nkaspa_uptime_seconds ${latestData.backendHealth.uptimeSeconds}`);
      lines.push(`# HELP kaspa_memory_usage_mb Backend memory usage in MB\n# TYPE kaspa_memory_usage_mb gauge\nkaspa_memory_usage_mb ${latestData.backendHealth.memoryUsageMB}`);
      lines.push(`# HELP kaspa_cycle_number Current cycle number\n# TYPE kaspa_cycle_number counter\nkaspa_cycle_number ${latestData.backendHealth.cycleNumber}`);
    }
    if (latestData?.performance) {
      lines.push(`# HELP kaspa_capital_sol Current capital in SOL\n# TYPE kaspa_capital_sol gauge\nkaspa_capital_sol ${latestData.performance.currentCapital}`);
      lines.push(`# HELP kaspa_pnl_sol Total PnL in SOL\n# TYPE kaspa_pnl_sol gauge\nkaspa_pnl_sol ${latestData.performance.totalPnlSol}`);
      lines.push(`# HELP kaspa_win_rate_percent Win rate in percent\n# TYPE kaspa_win_rate_percent gauge\nkaspa_win_rate_percent ${latestData.performance.winRate}`);
      lines.push(`# HELP kaspa_total_trades Total number of trades\n# TYPE kaspa_total_trades counter\nkaspa_total_trades ${latestData.performance.totalTrades}`);
      lines.push(`# HELP kaspa_open_positions Number of open positions\n# TYPE kaspa_open_positions gauge\nkaspa_open_positions ${latestData.performance.openPositions}`);
    }
    if (latestData?.latestPrediction) {
      lines.push(`# HELP kaspa_crash_probability Current crash probability\n# TYPE kaspa_crash_probability gauge\nkaspa_crash_probability ${latestData.latestPrediction.crashProbability}`);
    }
    if (latestData?.telemetry) {
      lines.push(`# HELP kaspa_propagation_time_ms Total propagation time in ms\n# TYPE kaspa_propagation_time_ms gauge\nkaspa_propagation_time_ms ${latestData.telemetry.propagationTimeMs || 0}`);
      const nodeLatencies = latestData.telemetry.nodeLatencies || {};
      for (const [nodeId, data] of Object.entries(nodeLatencies)) {
        const d = data as any;
        lines.push(`# HELP kaspa_node_latency_ms Latency per node in ms\n# TYPE kaspa_node_latency_ms gauge\nkaspa_node_latency_ms{node="${nodeId}"} ${d.avgLatencyMs || 0}`);
      }
    }
    lines.push(`# HELP kaspa_ws_connected Backend WebSocket connection status\n# TYPE kaspa_ws_connected gauge\nkaspa_ws_connected ${wsConnected ? 1 : 0}`);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(lines.join('\n') + '\n');
    return;
  }

  // Traces Endpoint
  if (url === '/traces' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ history: traceHistory, count: traceHistory.length }));
    return;
  }

  // Latest Data Endpoint
  if (url === '/latest' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(latestData || {}, null, 2));
    return;
  }

  // Dashboard HTML (JavaScript-free version with meta-refresh)
  if ((url === '/' || url === '/dashboard') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getDashboardHTML());
    return;
  }

  // Simple Dashboard without JS (for MCP browser compatibility)
  if (url === '/simple' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getSimpleDashboardHTML());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', availableEndpoints: ['/health', '/metrics', '/traces', '/latest', '/dashboard', '/events'] }));
});

function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KAS PA v4.2 - Live Monitor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'JetBrains Mono', monospace; background: #0a0a1a; color: #e0e0e0; min-height: 100vh; padding: 20px; }
    h1 { color: #fff; margin-bottom: 20px; font-size: 24px; background: linear-gradient(135deg, #00ff88, #4d96ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .card { background: #12122a; border: 1px solid #2a2a4a; border-radius: 12px; padding: 16px; transition: border-color 0.3s; }
    .card:hover { border-color: #4d96ff; }
    .card-title { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .card-value { font-size: 28px; font-weight: bold; color: #fff; }
    .card-subtitle { color: #666; font-size: 12px; margin-top: 4px; }
    .status-ok { color: #00ff88; } .status-warn { color: #ffa502; } .status-error { color: #ff4757; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .metric-item { background: #0a0a1a; padding: 8px; border-radius: 6px; text-align: center; }
    .metric-label { color: #666; font-size: 10px; } .metric-value { color: #fff; font-size: 18px; font-weight: bold; }
    .node-list { margin-top: 12px; }
    .node-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #1a1a2a; font-size: 12px; }
    .node-name { color: #888; } .node-latency { font-weight: bold; }
    .latency-good { color: #00ff88; } .latency-warn { color: #ffa502; } .latency-bad { color: #ff4757; }
    .alert-banner { background: #ff4757; color: #fff; padding: 12px; border-radius: 8px; margin-bottom: 20px; display: none; font-weight: bold; }
    .alert-banner.show { display: block; }
    .connection-status { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: #12122a; border-radius: 20px; margin-bottom: 20px; }
    .connection-dot { width: 10px; height: 10px; border-radius: 50%; background: #ff4757; }
    .connection-dot.connected { background: #00ff88; box-shadow: 0 0 10px #00ff88; }
    .raw-data { background: #0a0a1a; border-radius: 8px; padding: 12px; margin-top: 20px; font-size: 11px; overflow-x: auto; white-space: pre; color: #666; max-height: 200px; overflow-y: auto; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  </style>
</head>
<body>
  <h1>KAS PA v4.2 - Live Status Monitor</h1>
  <div id="alertBanner" class="alert-banner"></div>
  <div class="connection-status">
    <div id="wsDot" class="connection-dot"></div>
    <span id="wsStatus">Connecting...</span>
  </div>

  <div class="grid">
    <div class="card"><div class="card-title">System Uptime</div><div id="uptime" class="card-value">--</div><div id="cycleNumber" class="card-subtitle">Cycle: --</div></div>
    <div class="card"><div class="card-title">Memory Usage</div><div id="memory" class="card-value">-- MB</div></div>
    <div class="card"><div class="card-title">Crash Probability</div><div id="crashProb" class="card-value">--</div><div id="zone" class="card-subtitle">Zone: --</div></div>
    <div class="card"><div class="card-title">Capital</div><div id="capital" class="card-value">-- SOL</div><div id="pnl" class="card-subtitle">P&L: --</div></div>
    <div class="card"><div class="card-title">Win Rate</div><div id="winRate" class="card-value">--%</div><div id="totalTrades" class="card-subtitle">-- trades</div></div>
    <div class="card"><div class="card-title">Open Positions</div><div id="positions" class="card-value">--</div></div>
    <div class="card"><div class="card-title">Propagation Time</div><div id="propagation" class="card-value">-- ms</div><div class="card-subtitle">Trace: <span id="traceId">--</span></div></div>
    <div class="card"><div class="card-title">WebSocket Clients</div><div id="wsClients" class="card-value">--</div></div>
  </div>

  <div class="card" style="margin-bottom: 20px;">
    <div class="card-title">Node Latencies</div>
    <div id="nodeLatencies" class="node-list"><div class="node-item"><span class="node-name">Waiting for data...</span></div></div>
  </div>

  <div class="card">
    <div class="card-title">9 Crash Metrics (Top Coin)</div>
    <div class="metric-grid">
      <div class="metric-item"><div class="metric-label">n</div><div id="m-n" class="metric-value">--</div></div>
      <div class="metric-item"><div class="metric-label">PE</div><div id="m-PE" class="metric-value">--</div></div>
      <div class="metric-item"><div class="metric-label">kappa</div><div id="m-kappa" class="metric-value">--</div></div>
      <div class="metric-item"><div class="metric-label">Fragment</div><div id="m-frag" class="metric-value">--</div></div>
      <div class="metric-item"><div class="metric-label">Rt</div><div id="m-rt" class="metric-value">--</div></div>
      <div class="metric-item"><div class="metric-label">bValue</div><div id="m-bValue" class="metric-value">--</div></div>
      <div class="metric-item"><div class="metric-label">CTE</div><div id="m-CTE" class="metric-value">--</div></div>
      <div class="metric-item"><div class="metric-label">SSI</div><div id="m-SSI" class="metric-value">--</div></div>
      <div class="metric-item"><div class="metric-label">LFI</div><div id="m-LFI" class="metric-value">--</div></div>
    </div>
  </div>

  <div class="raw-data"><strong>Last Update:</strong> <span id="lastUpdate">--</span><br><strong>Raw:</strong> <pre id="rawJson">Waiting...</pre></div>

  <script>
    const evtSource = new EventSource('/events');
    evtSource.addEventListener('connected', () => { document.getElementById('wsStatus').textContent = 'SSE Connected'; document.getElementById('wsDot').className = 'connection-dot connected'; });
    evtSource.addEventListener('status', (e) => { const d = JSON.parse(e.data); document.getElementById('wsStatus').textContent = 'Backend: ' + (d.type === 'connected' ? 'Connected' : 'Disconnected'); document.getElementById('wsDot').className = 'connection-dot ' + (d.type === 'connected' ? 'connected' : ''); });
    evtSource.addEventListener('update', (e) => {
      const d = JSON.parse(e.data);
      if (d.backendHealth) { document.getElementById('uptime').textContent = formatUptime(d.backendHealth.uptimeSeconds); document.getElementById('cycleNumber').textContent = 'Cycle: ' + d.backendHealth.cycleNumber; document.getElementById('memory').textContent = d.backendHealth.memoryUsageMB + ' MB'; }
      document.getElementById('wsClients').textContent = d.connectedClients || '--';
      if (d.performance) { document.getElementById('capital').textContent = d.performance.currentCapital.toFixed(2) + ' SOL'; document.getElementById('pnl').textContent = 'P&L: ' + (d.performance.totalPnlSol >= 0 ? '+' : '') + d.performance.totalPnlSol.toFixed(3) + ' SOL'; document.getElementById('pnl').className = 'card-subtitle ' + (d.performance.totalPnlSol >= 0 ? 'status-ok' : 'status-error'); document.getElementById('winRate').textContent = d.performance.winRate.toFixed(1) + '%'; document.getElementById('totalTrades').textContent = d.performance.totalTrades + ' trades'; document.getElementById('positions').textContent = d.performance.openPositions; }
      if (d.latestPrediction) {
        const prob = (d.latestPrediction.crashProbability * 100).toFixed(1) + '%';
        document.getElementById('crashProb').textContent = prob;
        document.getElementById('crashProb').className = 'card-value ' + (d.latestPrediction.crashProbability >= 0.15 ? 'status-error' : d.latestPrediction.crashProbability >= 0.10 ? 'status-warn' : 'status-ok');
        document.getElementById('zone').textContent = 'Zone: ' + d.latestPrediction.zone;
        const alert = document.getElementById('alertBanner');
        if (d.latestPrediction.zone === 'IMMEDIATE_SHORT') { alert.textContent = 'IMMEDIATE_SHORT ZONE'; alert.className = 'alert-banner show'; }
        else if (d.latestPrediction.zone === 'MONITOR') { alert.textContent = 'MONITOR ZONE'; alert.className = 'alert-banner show'; alert.style.background = '#ffa502'; }
        else alert.className = 'alert-banner';
        if (d.latestPrediction.rawMetrics) { const rm = d.latestPrediction.rawMetrics; document.getElementById('m-n').textContent = rm.n?.toFixed(2) || '--'; document.getElementById('m-PE').textContent = rm.PE?.toFixed(2) || '--'; document.getElementById('m-kappa').textContent = rm.kappa?.toFixed(2) || '--'; document.getElementById('m-frag').textContent = rm.fragmentation?.toFixed(2) || '--'; document.getElementById('m-rt').textContent = rm.rt?.toFixed(2) || '--'; document.getElementById('m-bValue').textContent = rm.bValue?.toFixed(2) || '--'; document.getElementById('m-CTE').textContent = rm.CTE?.toFixed(2) || '--'; document.getElementById('m-SSI').textContent = rm.SSI?.toFixed(2) || '--'; document.getElementById('m-LFI').textContent = rm.LFI?.toFixed(2) || '--'; }
      }
      if (d.telemetry) { document.getElementById('propagation').textContent = (d.telemetry.propagationTimeMs || 0).toFixed(1) + ' ms'; document.getElementById('traceId').textContent = (d.telemetry.traceId || '--').substring(0, 12); const latencies = d.telemetry.nodeLatencies || {}; const entries = Object.entries(latencies); if (entries.length > 0) { document.getElementById('nodeLatencies').innerHTML = entries.map(([nodeId, data]) => { const latency = data.avgLatencyMs || 0; const latencyClass = latency < 50 ? 'latency-good' : latency < 100 ? 'latency-warn' : 'latency-bad'; return '<div class="node-item"><span class="node-name">' + nodeId + '</span><span class="node-latency ' + latencyClass + '">' + latency.toFixed(1) + 'ms</span></div>'; }).join(''); } }
      document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
      document.getElementById('rawJson').textContent = JSON.stringify(d, null, 2);
    });
    function formatUptime(s) { if (!s) return '--'; const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h > 0 ? h + 'h ' + m + 'm' : m + 'm'; }
  </script>
</body>
</html>`;
}

function getSimpleDashboardHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="3">
  <title>KAS PA v4.2 - Live Status</title>
  <style>
    body { font-family: monospace; background: #0a0a1a; color: #00ff88; padding: 20px; }
    h1 { color: #fff; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; }
    .card { background: #12122a; border: 1px solid #333; border-radius: 8px; padding: 16px; }
    .card-title { color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 8px; }
    .card-value { font-size: 24px; font-weight: bold; color: #fff; }
    .ok { color: #00ff88; } .warn { color: #ffa502; } .error { color: #ff4757; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 4px; border-bottom: 1px solid #333; }
    td:first-child { color: #888; width: 40%; }
  </style>
</head>
<body>
  <h1>KAS PA v4.2 - Live Status</h1>
  <p><a href="/dashboard" style="color:#4d96ff;">JS Dashboard</a> | <a href="/metrics" style="color:#4d96ff;">Prometheus</a> | <a href="/simple" style="color:#4d96ff;">Simple</a></p>
  <div id="data">Loading...</div>
  <script>
    fetch('/latest')
      .then(r => r.json())
      .then(d => {
        const cp = d.latestPrediction?.crashProbability || 0;
        const zone = d.latestPrediction?.zone || 'N/A';
        const prop = d.telemetry?.propagationTimeMs || 0;
        const rm = d.latestPrediction?.rawMetrics || {};
        const cap = d.performance?.currentCapital || 0;
        const pnl = d.performance?.totalPnlSol || 0;
        const wr = d.performance?.winRate || 0;
        const pos = d.performance?.openPositions || 0;
        const cyc = d.backendHealth?.cycleNumber || 0;
        const mem = d.backendHealth?.memoryUsageMB || 0;
        const uptime = d.backendHealth?.uptimeSeconds || 0;
        const h = Math.floor(uptime/3600);
        const m = Math.floor((uptime%3600)/60);
        const upStr = h > 0 ? h + 'h ' + m + 'm' : m + 'm';
        const cpClass = cp >= 0.15 ? 'error' : cp >= 0.10 ? 'warn' : 'ok';
        const pnlClass = pnl >= 0 ? 'ok' : 'error';
        const html = '<div class="grid">' +
          '<div class="card"><div class="card-title">System</div><div class="card-value">' + upStr + '</div><div>Cycle: ' + cyc + '</div></div>' +
          '<div class="card"><div class="card-title">Memory</div><div class="card-value">' + mem + ' MB</div></div>' +
          '<div class="card"><div class="card-title">Crash Probability</div><div class="card-value ' + cpClass + '">' + (cp*100).toFixed(1) + '%</div><div>Zone: ' + zone + '</div></div>' +
          '<div class="card"><div class="card-title">Capital</div><div class="card-value">' + cap.toFixed(2) + ' SOL</div><div class="' + pnlClass + '">P&L: ' + (pnl >= 0 ? '+' : '') + pnl.toFixed(3) + ' SOL</div></div>' +
          '<div class="card"><div class="card-title">Win Rate</div><div class="card-value">' + (wr*100).toFixed(1) + '%</div><div>Trades: ' + (d.performance?.totalTrades || 0) + ' | Pos: ' + pos + '</div></div>' +
          '<div class="card"><div class="card-title">Propagation</div><div class="card-value">' + prop.toFixed(1) + ' ms</div><div>Trace: ' + (d.telemetry?.traceId || '--').substring(0,12) + '</div></div>' +
          '</div>' +
          '<div class="card" style="margin-top:16px;"><div class="card-title">9 Crash Metrics</div><table>' +
          '<tr><td>n (Hawkes)</td><td>' + (rm.n?.toFixed(3) || '--') + '</td></tr>' +
          '<tr><td>PE (Entropy)</td><td>' + (rm.PE?.toFixed(3) || '--') + '</td></tr>' +
          '<tr><td>kappa</td><td>' + (rm.kappa?.toFixed(3) || '--') + '</td></tr>' +
          '<tr><td>Fragmentation</td><td>' + (rm.fragmentation?.toFixed(3) || '--') + '</td></tr>' +
          '<tr><td>Rt</td><td>' + (rm.rt?.toFixed(3) || '--') + '</td></tr>' +
          '<tr><td>bValue</td><td>' + (rm.bValue?.toFixed(3) || '--') + '</td></tr>' +
          '<tr><td>CTE</td><td>' + (rm.CTE?.toFixed(3) || '--') + '</td></tr>' +
          '<tr><td>SSI</td><td>' + (rm.SSI?.toFixed(3) || '--') + '</td></tr>' +
          '<tr><td>LFI</td><td>' + (rm.LFI?.toFixed(3) || '--') + '</td></tr>' +
          '</table></div>' +
          '<p style="color:#666;margin-top:20px;">Last: ' + new Date().toLocaleTimeString() + ' | WS Clients: ' + (d.connectedClients || 0) + '</p>';
        document.getElementById('data').innerHTML = html;
      });
  </script>
</body>
</html>`;
}

server.listen(CONFIG.HTTP_PORT, '0.0.0.0', () => {
  console.log(`[UnifiedStatus] HTTP Server listening on http://0.0.0.0:${CONFIG.HTTP_PORT}`);
  console.log(`[UnifiedStatus] Dashboard: http://localhost:${CONFIG.HTTP_PORT}/dashboard`);
  console.log(`[UnifiedStatus] Simple: http://localhost:${CONFIG.HTTP_PORT}/simple`);
  console.log(`[UnifiedStatus] Metrics: http://localhost:${CONFIG.HTTP_PORT}/metrics`);
  console.log(`[UnifiedStatus] SSE: http://localhost:${CONFIG.HTTP_PORT}/events`);
});

connectToBackend();
setInterval(sendSSEHeartbeat, CONFIG.SSE_HEARTBEAT_INTERVAL);

process.on('SIGINT', () => { if (backendWs) backendWs.close(1000, 'SIGINT'); server.close(); process.exit(0); });
process.on('SIGTERM', () => { if (backendWs) backendWs.close(1000, 'SIGTERM'); server.close(); process.exit(0); });
console.log('[UnifiedStatus] KAS PA v4.2 Unified Status Server initialized');
