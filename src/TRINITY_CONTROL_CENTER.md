# TRINITY APEX LIVE CONTROL CENTER
## SOTA Monitoring Dashboard Specification

---

# 1. SYSTEMÜBERSICHT

## 1.1 Architektur des Kontrollzentrums

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        TRINITY APEX CONTROL CENTER                              │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     NODE A MONITORING (Links)                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │  │
│  │  │ gRPC Stream │  │ShredStream  │  │Core2 Hotpath│  │Core5 VLAN   │     │  │
│  │  │   Status    │  │  Status     │  │  Extractor  │  │ Transmit    │     │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     NODE B MONITORING (Rechts)                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │  │
│  │  │UDP Receive  │  │  Feature    │  │    ML       │  │  Telemetry  │     │  │
│  │  │   Port 8002 │  │  Validation │  │  Inference  │  │   Logger    │     │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     PROBLEM DETECTION & SOLUTIONS                         │  │
│  │  🔴 Critical Alerts  │  ⚠️ Warnings  │  💡 Solution Engine               │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                     HISTORISCHE TRENDS                                    │  │
│  │  📈 Throughput  │  📉 Error Rate  │  ⏱️ Latenz  │  📊 Buffer Diff        │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

# 2. FRONTEND KOMPONENTEN

## 2.1 Hauptlayout (App.tsx Control Center)

```tsx
// TRINITY CONTROL CENTER - Live System Overview

interface ControlCenterState {
  // NODE A METRIKEN
  nodeA: {
    grpcConnected: boolean;
    grpcErrors: number;
    grpcErrorRate: number;
    shredStreamActive: boolean;
    processedCount: number;
    processedPerSec: number;
    
    core2Received: number;
    core2Computed: number;
    core2Errors: number;
    core2ProcessingRate: number;
    
    core5Sent: number;
    core5Errors: number;
    core5BytesPerSec: number;
    core5SuccessRate: number;
    
    bufferDiff: number;
    bufferDiffPercent: number;
    
    lastSlot: number;
    slotGaps: number;
    timestampAge: number; // Sekunden
  };
  
  // NODE B METRIKEN
  nodeB: {
    udpPortOpen: boolean;
    packetsReceived: number;
    packetsPerSec: number;
    packetLossPercent: number;
    latencyMs: number;
    jitterMs: number;
    
    featureValidationErrors: number;
    validPacketsPercent: number;
    
    mlInferenceActive: boolean;
    lastInferenceTime: number;
    inferenceQueueDepth: number;
    
    telemetryWriteErrors: number;
    duckDbConnected: boolean;
  };
  
  // SHARED MEMORY
  sharedMemory: {
    magicValid: boolean;
    version: number;
    headPointer: number;
    timestampAge: number;
    slotContinuity: number;
    validFlag: boolean;
  };
  
  // SYSTEM HEALTH
  system: {
    redisConnected: boolean;
    redisLatency: number;
    duckDbHealthy: boolean;
    killSwitchActive: boolean;
    overfittingRisk: number;
    
    cpuUsage: number;
    memoryUsage: number;
    memoryUsedMB: number;
    memoryLimitMB: number;
  };
  
  // ALERTS
  alerts: Alert[];
  solutions: Solution[];
  
  // TRENDS (Letzte 100 Datenpunkte)
  trends: {
    throughputHistory: number[];
    errorRateHistory: number[];
    latencyHistory: number[];
    bufferDiffHistory: number[];
  };
}

interface Alert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  source: string;
  title: string;
  description: string;
  timestamp: Date;
  acknowledged: boolean;
  rootCause: string;
}

interface Solution {
  alertId: string;
  action: string;
  command?: string;
  autoExecutable: boolean;
  estimatedTime: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}
```

## 2.2 Node A Status Panel

```tsx
const NodeAMonitor = ({ metrics }: { metrics: NodeA.Metrics }) => {
  const getGrpcStatus = () => {
    if (metrics.grpcErrorRate > 0.1) return 'CRITICAL';
    if (metrics.grpcErrorRate > 0.01) return 'WARNING';
    return 'HEALTHY';
  };
  
  const getProcessingStatus = () => {
    if (metrics.core2ProcessingRate < 99) return 'CRITICAL';
    if (metrics.core2ProcessingRate < 100) return 'WARNING';
    return 'HEALTHY';
  };
  
  const getBufferStatus = () => {
    if (metrics.bufferDiffPercent > 1) return 'CRITICAL';
    if (metrics.bufferDiffPercent > 0.1) return 'WARNING';
    return 'HEALTHY';
  };
  
  return (
    <div className="grid grid-cols-4 gap-4">
      {/* gRPC Stream */}
      <MetricCard
        title="gRPC Stream"
        status={getGrpcStatus()}
        icon={<Zap className="w-5 h-5" />}
        metrics={[
          { label: 'Error Rate', value: `${metrics.grpcErrorRate.toFixed(4)}%`, 
            color: metrics.grpcErrorRate > 0.1 ? 'red' : 'green' },
          { label: 'Errors', value: metrics.grpcErrors.toLocaleString() },
          { label: 'Processed', value: metrics.processedCount.toLocaleString() },
          { label: '/sec', value: metrics.processedPerSec.toFixed(0) }
        ]}
      />
      
      {/* ShredStream */}
      <MetricCard
        title="Jito ShredStream"
        status={metrics.shredStreamActive ? 'HEALTHY' : 'CRITICAL'}
        icon={<Radio className="w-5 h-5" />}
        metrics={[
          { label: 'Active', value: metrics.shredStreamActive ? 'YES' : 'NO',
            color: metrics.shredStreamActive ? 'green' : 'red' },
          { label: 'Last Slot', value: metrics.lastSlot.toString() },
          { label: 'Slot Gaps', value: metrics.slotGaps.toString(),
            color: metrics.slotGaps > 0 ? 'red' : 'green' },
          { label: 'TS Age', value: `${metrics.timestampAge}s`,
            color: metrics.timestampAge > 5 ? 'red' : 'green' }
        ]}
      />
      
      {/* Core2 Hotpath */}
      <MetricCard
        title="Core2 Hotpath"
        status={getProcessingStatus()}
        icon={<Cpu className="w-5 h-5" />}
        metrics={[
          { label: 'Received', value: metrics.core2Received.toLocaleString() },
          { label: 'Computed', value: metrics.core2Computed.toLocaleString() },
          { label: 'Errors', value: metrics.core2Errors.toString(),
            color: metrics.core2Errors > 0 ? 'red' : 'green' },
          { label: 'Rate', value: `${metrics.core2ProcessingRate.toFixed(2)}%`,
            color: metrics.core2ProcessingRate < 100 ? 'red' : 'green' }
        ]}
      />
      
      {/* Core5 VLAN */}
      <MetricCard
        title="Core5 VLAN"
        status={metrics.core5SuccessRate < 99 ? 'CRITICAL' : 'HEALTHY'}
        icon={<Send className="w-5 h-5" />}
        metrics={[
          { label: 'Sent', value: metrics.core5Sent.toLocaleString() },
          { label: 'Errors', value: metrics.core5Errors.toString() },
          { label: 'MB/s', value: (metrics.core5BytesPerSec / 1024 / 1024).toFixed(2) },
          { label: 'Success', value: `${metrics.core5SuccessRate.toFixed(2)}%`,
            color: metrics.core5SuccessRate < 100 ? 'red' : 'green' }
        ]}
      />
      
      {/* Buffer Diff */}
      <div className="col-span-4">
        <BufferDiffGauge value={metrics.bufferDiffPercent} />
      </div>
    </div>
  );
};
```

## 2.3 Node B Status Panel

```tsx
const NodeBMonitor = ({ metrics }: { metrics: NodeB.Metrics }) => {
  const getUdpStatus = () => {
    if (!metrics.udpPortOpen) return 'CRITICAL';
    if (metrics.packetLossPercent > 1) return 'CRITICAL';
    if (metrics.latencyMs > 100) return 'WARNING';
    if (metrics.jitterMs > 50) return 'WARNING';
    return 'HEALTHY';
  };
  
  const getFeatureStatus = () => {
    if (metrics.validPacketsPercent < 99) return 'CRITICAL';
    if (metrics.validPacketsPercent < 100) return 'WARNING';
    return 'HEALTHY';
  };
  
  return (
    <div className="grid grid-cols-4 gap-4">
      {/* UDP Receive */}
      <MetricCard
        title="UDP Receive :8002"
        status={getUdpStatus()}
        icon={<Radio className="w-5 h-5" />}
        metrics={[
          { label: 'Port Open', value: metrics.udpPortOpen ? 'YES' : 'NO',
            color: metrics.udpPortOpen ? 'green' : 'red' },
          { label: 'Received', value: metrics.packetsReceived.toLocaleString() },
          { label: '/sec', value: metrics.packetsPerSec.toFixed(1) },
          { label: 'Loss', value: `${metrics.packetLossPercent.toFixed(2)}%`,
            color: metrics.packetLossPercent > 1 ? 'red' : 'green' }
        ]}
      />
      
      {/* Latenz */}
      <MetricCard
        title="Network Quality"
        status={metrics.latencyMs > 100 || metrics.jitterMs > 50 ? 'WARNING' : 'HEALTHY'}
        icon={<Activity className="w-5 h-5" />}
        metrics={[
          { label: 'Latency', value: `${metrics.latencyMs.toFixed(1)}ms`,
            color: metrics.latencyMs > 100 ? 'red' : 'green' },
          { label: 'Jitter', value: `${metrics.jitterMs.toFixed(1)}ms`,
            color: metrics.jitterMs > 50 ? 'red' : 'green' },
          { label: 'Valid', value: `${metrics.validPacketsPercent.toFixed(1)}%`,
            color: metrics.validPacketsPercent < 100 ? 'red' : 'green' },
          { label: 'Val Errors', value: metrics.featureValidationErrors.toString() }
        ]}
      />
      
      {/* ML Inference */}
      <MetricCard
        title="ML Inference"
        status={metrics.mlInferenceActive ? 'HEALTHY' : 'WARNING'}
        icon={<Brain className="w-5 h-5" />}
        metrics={[
          { label: 'Active', value: metrics.mlInferenceActive ? 'YES' : 'NO' },
          { label: 'Last Run', value: `${((Date.now() - metrics.lastInferenceTime) / 1000).toFixed(0)}s ago` },
          { label: 'Queue', value: metrics.inferenceQueueDepth.toString(),
            color: metrics.inferenceQueueDepth > 100 ? 'red' : 'green' }
        ]}
      />
      
      {/* Telemetry */}
      <MetricCard
        title="DuckDB Telemetry"
        status={metrics.duckDbConnected ? 'HEALTHY' : 'CRITICAL'}
        icon={<Database className="w-5 h-5" />}
        metrics={[
          { label: 'Connected', value: metrics.duckDbConnected ? 'YES' : 'NO',
            color: metrics.duckDbConnected ? 'green' : 'red' },
          { label: 'Write Err', value: metrics.telemetryWriteErrors.toString(),
            color: metrics.telemetryWriteErrors > 0 ? 'red' : 'green' }
        ]}
      />
    </div>
  );
};
```

## 2.4 Shared Memory Monitor

```tsx
const SharedMemoryMonitor = ({ shm }: { shm: SharedMemory.Status }) => {
  return (
    <div className="border border-white/10 p-4 bg-white/[0.02]">
      <h3 className="text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
        <HardDrive className="w-4 h-4 text-emerald-400" />
        Shared Memory /dev/shm/kas_pa_features
      </h3>
      
      <div className="grid grid-cols-6 gap-4 text-[10px]">
        <div className="flex flex-col gap-1">
          <span className="opacity-40">MAGIC</span>
          <span className={shm.magicValid ? 'text-emerald-400' : 'text-red-400'}>
            {shm.magicValid ? '✓ VALID' : '✗ CORRUPT'}
          </span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="opacity-40">Version</span>
          <span>{shm.version}</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="opacity-40">Head Ptr</span>
          <span>0x{shm.headPointer.toString(16)}</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="opacity-40">TS Age</span>
          <span className={shm.timestampAge > 5 ? 'text-red-400' : 'text-emerald-400'}>
            {shm.timestampAge.toFixed(1)}s
          </span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="opacity-40">Slot Continuity</span>
          <span className={shm.slotContinuity < 100 ? 'text-red-400' : 'text-emerald-400'}>
            {shm.slotContinuity.toFixed(1)}%
          </span>
        </div>
        
        <div className="flex flex-col gap-1">
          <span className="opacity-40">Valid Flag</span>
          <span className={shm.validFlag ? 'text-emerald-400' : 'text-red-400'}>
            {shm.validFlag ? 'TRUE' : 'FALSE'}
          </span>
        </div>
      </div>
      
      {/* Feature Vector Preview */}
      <div className="mt-4 p-2 bg-black/40 border border-white/5">
        <span className="text-[9px] opacity-40 uppercase">Last 40 Features</span>
        <div className="mt-2 flex gap-1">
          {shm.lastFeatures.map((f, i) => (
            <div 
              key={i}
              className="w-2 h-4 bg-emerald-500/30"
              style={{ height: `${Math.max(2, Math.min(16, f * 16))}px` }}
              title={`[${i}]: ${f.toFixed(4)}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
```

## 2.5 Problem Detection & Solution Engine

```tsx
const ProblemDetectionPanel = ({ 
  alerts, 
  solutions, 
  onAcknowledge,
  onExecuteSolution 
}: {
  alerts: Alert[];
  solutions: Solution[];
  onAcknowledge: (id: string) => void;
  onExecuteSolution: (id: string) => void;
}) => {
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL' && !a.acknowledged);
  const warnings = alerts.filter(a => a.severity === 'WARNING' && !a.acknowledged);
  
  return (
    <div className="space-y-4">
      {/* Critical Alerts */}
      {criticalAlerts.length > 0 && (
        <div className="border border-red-500/50 bg-red-500/10 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-red-400 flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4" />
            CRITICAL ALERTS ({criticalAlerts.length})
          </h3>
          
          <div className="space-y-3">
            {criticalAlerts.map(alert => {
              const solution = solutions.find(s => s.alertId === alert.id);
              return (
                <div key={alert.id} className="border border-red-500/20 p-3 bg-black/40">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-red-400">{alert.title}</div>
                      <div className="text-[10px] opacity-60 mt-1">{alert.description}</div>
                      <div className="text-[9px] opacity-40 mt-1">
                        Root Cause: {alert.rootCause}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => onAcknowledge(alert.id)}
                        className="text-[9px] px-2 py-1 border border-white/20 hover:bg-white/10"
                      >
                        ACK
                      </button>
                      {solution && solution.autoExecutable && (
                        <button 
                          onClick={() => onExecuteSolution(alert.id)}
                          className="text-[9px] px-2 py-1 bg-emerald-500/20 border border-emerald-500/50 hover:bg-emerald-500/30"
                        >
                          FIX
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {solution && (
                    <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/20">
                      <div className="text-[9px] text-emerald-400">
                        💡 SOLUTION: {solution.action}
                      </div>
                      {solution.command && (
                        <code className="text-[8px] mt-1 block font-mono opacity-60">
                          {solution.command}
                        </code>
                      )}
                      <div className="text-[8px] opacity-40 mt-1">
                        Est. Time: {solution.estimatedTime} | Risk: {solution.risk}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="border border-amber-500/50 bg-amber-500/10 p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-amber-400 flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" />
            WARNINGS ({warnings.length})
          </h3>
          
          <div className="space-y-2">
            {warnings.map(alert => (
              <div key={alert.id} className="flex justify-between items-center text-[10px]">
                <span className="text-amber-400">{alert.title}</span>
                <button 
                  onClick={() => onAcknowledge(alert.id)}
                  className="text-[9px] px-2 py-0.5 border border-amber-500/30 hover:bg-amber-500/10"
                >
                  ACK
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {alerts.length === 0 && (
        <div className="border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <div className="text-emerald-400 text-xs">ALL SYSTEMS OPERATIONAL</div>
        </div>
      )}
    </div>
  );
};
```

## 2.6 Historische Trends

```tsx
const TrendCharts = ({ trends }: { trends: SystemTrends }) => {
  return (
    <div className="grid grid-cols-4 gap-4">
      <TrendChart 
        title="Throughput" 
        data={trends.throughputHistory}
        unit="tx/sec"
        color="emerald"
        threshold={50}
      />
      <TrendChart 
        title="Error Rate" 
        data={trends.errorRateHistory}
        unit="%"
        color="red"
        threshold={0.01}
        invertThreshold
      />
      <TrendChart 
        title="Latency" 
        data={trends.latencyHistory}
        unit="ms"
        color="blue"
        threshold={100}
        invertThreshold
      />
      <TrendChart 
        title="Buffer Diff" 
        data={trends.bufferDiffHistory}
        unit="%"
        color="amber"
        threshold={0.1}
        invertThreshold
      />
    </div>
  );
};

const TrendChart = ({ title, data, unit, color, threshold, invertThreshold }: {
  title: string;
  data: number[];
  unit: string;
  color: string;
  threshold?: number;
  invertThreshold?: boolean;
}) => {
  const lastValue = data[data.length - 1] || 0;
  const isHealthy = threshold 
    ? invertThreshold 
      ? lastValue <= threshold 
      : lastValue >= threshold
    : true;
    
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  
  return (
    <div className="border border-white/10 p-4 bg-white/[0.02]">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[10px] uppercase tracking-widest opacity-60">{title}</span>
        <span className={`text-sm font-bold text-${color}-400`}>
          {lastValue.toFixed(2)} {unit}
        </span>
      </div>
      
      <div className="h-12 flex items-end gap-[2px]">
        {data.map((value, i) => {
          const height = ((value - min) / (max - min)) * 100;
          const isAboveThreshold = invertThreshold ? value > threshold : value < threshold;
          return (
            <div 
              key={i}
              className={`flex-1 bg-${color}-500/60 ${isAboveThreshold ? 'bg-red-500/80' : ''}`}
              style={{ height: `${Math.max(2, height)}%` }}
            />
          );
        })}
      </div>
      
      {threshold && (
        <div className="mt-2 text-[8px] opacity-40">
          Threshold: {threshold} {unit} ({isHealthy ? '✓ OK' : '✗ BREACHED'})
        </div>
      )}
    </div>
  );
};
```

---

# 3. BACKEND API ENDPOINTS

## 3.1 server.ts Control Center Endpoints

```typescript
// Additional Express routes for Control Center

// Node A Metrics
app.get("/api/control/node-a", async (req, res) => {
  try {
    const metrics = {
      grpcConnected: await checkGrpcConnection(),
      grpcErrors: await getGrpcErrorCount(),
      grpcErrorRate: await calculateGrpcErrorRate(),
      shredStreamActive: await isShredStreamActive(),
      processedCount: await getProcessedCount(),
      processedPerSec: await getProcessedPerSecond(),
      
      core2Received: await getCore2Received(),
      core2Computed: await getCore2Computed(),
      core2Errors: await getCore2Errors(),
      core2ProcessingRate: await getProcessingRate(),
      
      core5Sent: await getCore5Sent(),
      core5Errors: await getCore5Errors(),
      core5BytesPerSec: await getCore5Throughput(),
      core5SuccessRate: await getCore5SuccessRate(),
      
      bufferDiff: await getBufferDiff(),
      bufferDiffPercent: await calculateBufferDiffPercent(),
      
      lastSlot: await getLastSlot(),
      slotGaps: await countSlotGaps(),
      timestampAge: await getTimestampAge()
    };
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Node B Metrics
app.get("/api/control/node-b", async (req, res) => {
  try {
    const metrics = {
      udpPortOpen: await isUdpPortOpen(8002),
      packetsReceived: await getPacketsReceived(),
      packetsPerSec: await getPacketsPerSecond(),
      packetLossPercent: await calculatePacketLoss(),
      latencyMs: await measureLatency(),
      jitterMs: await measureJitter(),
      
      featureValidationErrors: await getFeatureValidationErrors(),
      validPacketsPercent: await getValidPacketsPercent(),
      
      mlInferenceActive: await isMlInferenceActive(),
      lastInferenceTime: await getLastInferenceTime(),
      inferenceQueueDepth: await getInferenceQueueDepth(),
      
      telemetryWriteErrors: await getTelemetryWriteErrors(),
      duckDbConnected: await isDuckDbConnected()
    };
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shared Memory Status
app.get("/api/control/shm", async (req, res) => {
  try {
    const shm = await readSharedMemory();
    res.json({
      magicValid: shm.magic === 0xDEADBEEFCAFEBABE,
      version: shm.version,
      headPointer: shm.headPointer,
      timestampAge: (Date.now() / 1000) - shm.timestamp,
      slotContinuity: await calculateSlotContinuity(shm.slot),
      validFlag: shm.valid,
      lastFeatures: Array.from(shm.features)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// System Health
app.get("/api/control/system", async (req, res) => {
  try {
    const mem = process.memoryUsage();
    res.json({
      redisConnected: await isRedisConnected(),
      redisLatency: await measureRedisLatency(),
      duckDbHealthy: await isDuckDbHealthy(),
      killSwitchActive: fs.existsSync('/data/trinity_apex/STOP_TRADING.lock'),
      overfittingRisk: await getOverfittingRisk(),
      cpuUsage: os.loadavg()[0],
      memoryUsage: (mem.heapUsed / mem.heapLimit) * 100,
      memoryUsedMB: mem.heapUsed / 1024 / 1024,
      memoryLimitMB: mem.heapLimit / 1024 / 1024
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alerts & Solutions
app.get("/api/control/alerts", async (req, res) => {
  const alerts = await detectAlerts();
  const solutions = await generateSolutions(alerts);
  res.json({ alerts, solutions });
});

app.post("/api/control/alerts/:id/acknowledge", async (req, res) => {
  await acknowledgeAlert(req.params.id);
  res.json({ success: true });
});

app.post("/api/control/solutions/:alertId/execute", async (req, res) => {
  const result = await executeSolution(req.params.alertId);
  res.json(result);
});

// Historical Trends
app.get("/api/control/trends", async (req, res) => {
  res.json(await getHistoricalTrends());
});
```

---

# 4. PROBLEM DETECTION ENGINE

## 4.1 Alert Detection Logic

```typescript
interface AlertRule {
  name: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  condition: (metrics: SystemMetrics) => boolean;
  title: string;
  description: (metrics: SystemMetrics) => string;
  rootCause: (metrics: SystemMetrics) => string;
  solutionTemplate: string;
}

const ALERT_RULES: AlertRule[] = [
  // NODE A CRITICAL
  {
    name: 'GRPC_CONNECTION_LOST',
    severity: 'CRITICAL',
    condition: (m) => !m.nodeA.grpcConnected,
    title: 'gRPC Connection Lost',
    description: (m) => `Cannot connect to Yellowstone gRPC endpoint. ${m.nodeA.grpcErrors} errors recorded.`,
    rootCause: (m) => 'Chainstack endpoint unreachable or token expired',
    solutionTemplate: 'Check Chainstack dashboard, verify token, restart Core0'
  },
  {
    name: 'GRPC_HIGH_ERROR_RATE',
    severity: 'CRITICAL',
    condition: (m) => m.nodeA.grpcErrorRate > 0.1,
    title: 'gRPC Error Rate Critical',
    description: (m) => `Error rate at ${m.nodeA.grpcErrorRate.toFixed(4)}% (threshold: 0.1%)`,
    rootCause: (m) => 'Network instability or server-side throttling',
    solutionTemplate: 'Check network route to Chainstack, consider failover'
  },
  {
    name: 'PROCESSING_RATE_LOW',
    severity: 'CRITICAL',
    condition: (m) => m.nodeA.core2ProcessingRate < 99,
    title: 'Core2 Processing Rate Below 99%',
    description: (m) => `Processing rate at ${m.nodeA.core2ProcessingRate.toFixed(2)}%. Data loss imminent.`,
    rootCause: (m) => 'Core2 bottleneck - CPU saturation or memory pressure',
    solutionTemplate: 'Scale Core2 horizontally, check CPU/memory limits'
  },
  {
    name: 'BUFFER_OVERFLOW',
    severity: 'CRITICAL',
    condition: (m) => m.nodeA.bufferDiffPercent > 1,
    title: 'Buffer Diff Critical (>1%)',
    description: (m) => `Buffer diff at ${m.nodeA.bufferDiffPercent.toFixed(2)}%. Data being dropped.`,
    rootCause: (m) => 'Core2 cannot consume as fast as Core0 produces',
    solutionTemplate: 'Increase Core2 processing capacity, check for memory leaks'
  },
  {
    name: 'VLAN_TRANSMISSION_FAILED',
    severity: 'CRITICAL',
    condition: (m) => m.nodeA.core5SuccessRate < 99,
    title: 'VLAN Transmission Failure',
    description: (m) => `${m.nodeA.core5Errors} VLAN send errors. Node B not receiving data.`,
    rootCause: (m) => 'Network issue between Node A and Node B',
    solutionTemplate: 'Check VLAN interface, verify 10.0.1.2 reachable, restart Core5'
  },
  
  // NODE B CRITICAL
  {
    name: 'UDP_PORT_CLOSED',
    severity: 'CRITICAL',
    condition: (m) => !m.nodeB.udpPortOpen,
    title: 'UDP Port 8002 Closed',
    description: (m) => 'Node B not listening on UDP port. Data stream interrupted.',
    rootCause: (m) => 'Node B receiver process crashed or firewall blocking',
    solutionTemplate: 'Restart Node B receiver, check firewall rules'
  },
  {
    name: 'HIGH_PACKET_LOSS',
    severity: 'CRITICAL',
    condition: (m) => m.nodeB.packetLossPercent > 1,
    title: 'Packet Loss Above 1%',
    description: (m) => `Packet loss at ${m.nodeB.packetLossPercent.toFixed(2)}%. Data integrity compromised.`,
    rootCause: (m) => 'Network congestion or hardware issue on VLAN path',
    solutionTemplate: 'Check network hardware, verify VLAN configuration'
  },
  {
    name: 'DUCKDB_DISCONNECTED',
    severity: 'CRITICAL',
    condition: (m) => !m.nodeB.duckDbConnected,
    title: 'DuckDB Disconnected',
    description: (m) => 'Cannot write to DuckDB. Telemetry data being lost.',
    rootCause: (m) => 'DuckDB process crashed or disk full',
    solutionTemplate: 'Check DuckDB process, verify disk space, check /dev/shm size'
  },
  
  // SHARED MEMORY
  {
    name: 'SHM_MAGIC_CORRUPT',
    severity: 'CRITICAL',
    condition: (m) => !m.sharedMemory.magicValid,
    title: 'Shared Memory Magic Header Corrupt',
    description: (m) => 'MAGIC header is invalid. Memory corruption detected.',
    rootCause: (m) => 'Core2/Core5 memory write error or hardware issue',
    solutionTemplate: 'Restart Core2 and Core5, check for memory errors'
  },
  {
    name: 'SHM_TIMESTAMP_STALE',
    severity: 'CRITICAL',
    condition: (m) => m.sharedMemory.timestampAge > 5,
    title: 'Shared Memory Timestamp Stale',
    description: (m) => `SHM data is ${m.sharedMemory.timestampAge.toFixed(1)} seconds old.`,
    rootCause: (m) => 'Core2 not writing to shared memory',
    solutionTemplate: 'Check Core2 health, restart if necessary'
  },
  
  // WARNINGS
  {
    name: 'GRPC_ERROR_RATE_WARNING',
    severity: 'WARNING',
    condition: (m) => m.nodeA.grpcErrorRate > 0.01 && m.nodeA.grpcErrorRate <= 0.1,
    title: 'gRPC Error Rate Elevated',
    description: (m) => `Error rate at ${m.nodeA.grpcErrorRate.toFixed(4)}% (warning threshold: 0.01%)`,
    rootCause: (m) => 'Minor network instability',
    solutionTemplate: 'Monitor closely, prepare for potential failover'
  },
  {
    name: 'HIGH_LATENCY',
    severity: 'WARNING',
    condition: (m) => m.nodeB.latencyMs > 100,
    title: 'Network Latency High',
    description: (m) => `Latency at ${m.nodeB.latencyMs.toFixed(1)}ms (threshold: 100ms)`,
    rootCause: (m) => 'Network congestion between Node A and B',
    solutionTemplate: 'Check network hardware, consider QoS configuration'
  },
  {
    name: 'HIGH_JITTER',
    severity: 'WARNING',
    condition: (m) => m.nodeB.jitterMs > 50,
    title: 'Network Jitter High',
    description: (m) => `Jitter at ${m.nodeB.jitterMs.toFixed(1)}ms (threshold: 50ms)`,
    rootCause: (m) => 'Unstable network connection',
    solutionTemplate: 'Check for network interference, verify cabling'
  },
  {
    name: 'KILL_SWITCH_ACTIVE',
    severity: 'WARNING',
    condition: (m) => m.system.killSwitchActive,
    title: 'Kill Switch Active',
    description: (m) => 'STOP_TRADING.lock exists. System in safe mode.',
    rootCause: (m) => 'Manual intervention or automated safety trigger',
    solutionTemplate: 'Remove /data/trinity_apex/STOP_TRADING.lock to resume'
  },
  {
    name: 'OVERFITTING_RISK',
    severity: 'WARNING',
    condition: (m) => m.system.overfittingRisk > 0.3,
    title: 'ML Model Overfitting Risk',
    description: (m) => `Overfitting risk at ${(m.system.overfittingRisk * 100).toFixed(1)}%`,
    rootCause: (m) => 'Model drift or data distribution change',
    solutionTemplate: 'Trigger model retraining, review recent data'
  }
];

async function detectAlerts(): Promise<Alert[]> {
  const metrics = await gatherAllMetrics();
  const alerts: Alert[] = [];
  
  for (const rule of ALERT_RULES) {
    if (rule.condition(metrics)) {
      alerts.push({
        id: generateAlertId(rule.name),
        severity: rule.severity,
        source: 'CONTROL_CENTER',
        title: rule.title,
        description: rule.description(metrics),
        timestamp: new Date(),
        acknowledged: false,
        rootCause: rule.rootCause(metrics)
      });
    }
  }
  
  return alerts.sort((a, b) => {
    const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}
```

## 4.2 Solution Generation Engine

```typescript
interface SolutionTemplate {
  action: string;
  command?: string;
  autoExecutable: boolean;
  estimatedTime: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
}

const SOLUTION_TEMPLATES: Record<string, SolutionTemplate> = {
  'GRPC_CONNECTION_LOST': {
    action: 'Restart Core0 gRPC connection',
    command: 'systemctl restart trinity-core0',
    autoExecutable: true,
    estimatedTime: '30 seconds',
    risk: 'LOW'
  },
  'GRPC_HIGH_ERROR_RATE': {
    action: 'Check network route and consider failover to backup endpoint',
    command: 'ping -c 10 yellowstone-solana-mainnet.core.chainstack.com',
    autoExecutable: false,
    estimatedTime: '5 minutes',
    risk: 'MEDIUM'
  },
  'PROCESSING_RATE_LOW': {
    action: 'Scale Core2 horizontally or increase memory limits',
    command: 'kubectl scale deployment trinity-core2 --replicas=3',
    autoExecutable: true,
    estimatedTime: '2 minutes',
    risk: 'MEDIUM'
  },
  'BUFFER_OVERFLOW': {
    action: 'Increase buffer size or scale Core2',
    command: 'curl -X POST http://core2-api:8080/scale -d "factor=2"',
    autoExecutable: true,
    estimatedTime: '1 minute',
    risk: 'LOW'
  },
  'VLAN_TRANSMISSION_FAILED': {
    action: 'Restart Core5 VLAN transmitter',
    command: 'systemctl restart trinity-core5',
    autoExecutable: true,
    estimatedTime: '30 seconds',
    risk: 'LOW'
  },
  'UDP_PORT_CLOSED': {
    action: 'Restart Node B receiver process',
    command: 'systemctl restart trinity-node-b-receiver',
    autoExecutable: true,
    estimatedTime: '30 seconds',
    risk: 'LOW'
  },
  'HIGH_PACKET_LOSS': {
    action: 'Check VLAN network hardware and cables',
    command: 'ethtool -S kas-pa-internal',
    autoExecutable: false,
    estimatedTime: '10 minutes',
    risk: 'LOW'
  },
  'DUCKDB_DISCONNECTED': {
    action: 'Check DuckDB process and disk space',
    command: 'df -h /dev/shm && systemctl restart trinity-writer',
    autoExecutable: true,
    estimatedTime: '30 seconds',
    risk: 'LOW'
  },
  'SHM_MAGIC_CORRUPT': {
    action: 'Restart Core2 and Core5 to reset shared memory',
    command: 'systemctl restart trinity-core2 trinity-core5',
    autoExecutable: true,
    estimatedTime: '1 minute',
    risk: 'MEDIUM'
  },
  'SHM_TIMESTAMP_STALE': {
    action: 'Restart Core2 which writes to shared memory',
    command: 'systemctl restart trinity-core2',
    autoExecutable: true,
    estimatedTime: '30 seconds',
    risk: 'LOW'
  },
  'KILL_SWITCH_ACTIVE': {
    action: 'Remove kill switch file to resume operation',
    command: 'rm /data/trinity_apex/STOP_TRADING.lock',
    autoExecutable: true,
    estimatedTime: '5 seconds',
    risk: 'LOW'
  }
};

async function generateSolutions(alerts: Alert[]): Promise<Solution[]> {
  return alerts.map(alert => {
    const template = SOLUTION_TEMPLATES[alert.name] || {
      action: 'Manual investigation required',
      autoExecutable: false,
      estimatedTime: 'Unknown',
      risk: 'HIGH'
    };
    
    return {
      alertId: alert.id,
      ...template
    };
  });
}
```

---

# 5. AUTO-HEALING ENGINE

## 5.1 Automatic Remediation

```typescript
const AUTO_HEAL_RULES: AutoHealRule[] = [
  {
    alertPattern: 'GRPC_CONNECTION_LOST',
    action: async () => {
      console.log('[AUTO-HEAL] Restarting Core0 gRPC connection...');
      execSync('systemctl restart trinity-core0', { stdio: 'inherit' });
    },
    retryCount: 3,
    retryDelayMs: 10000,
    escalateAfter: 3
  },
  {
    alertPattern: 'UDP_PORT_CLOSED',
    action: async () => {
      console.log('[AUTO-HEAL] Restarting Node B receiver...');
      execSync('systemctl restart trinity-node-b', { stdio: 'inherit' });
    },
    retryCount: 5,
    retryDelayMs: 5000,
    escalateAfter: 5
  },
  {
    alertPattern: 'HIGH_PACKET_LOSS',
    action: async () => {
      console.log('[AUTO-HEAL] Resetting VLAN interface...');
      execSync('ip link set kas-pa-internal down && ip link set kas-pa-internal up', { stdio: 'inherit' });
    },
    retryCount: 2,
    retryDelayMs: 5000,
    escalateAfter: 2
  },
  {
    alertPattern: 'DUCKDB_DISCONNECTED',
    action: async () => {
      console.log('[AUTO-HEAL] Restarting DuckDB writer...');
      execSync('systemctl restart trinity-writer', { stdio: 'inherit' });
    },
    retryCount: 3,
    retryDelayMs: 5000,
    escalateAfter: 3
  }
];

async function attemptAutoHeal(alert: Alert): Promise<boolean> {
  const rule = AUTO_HEAL_RULES.find(r => r.alertPattern === alert.name);
  if (!rule) return false;
  
  if (alert.acknowledged) return false; // Don't auto-heal acknowledged alerts
  
  console.log(`[AUTO-HEAL] Attempting to resolve ${alert.name}...`);
  
  for (let attempt = 1; attempt <= rule.retryCount; attempt++) {
    try {
      await rule.action();
      console.log(`[AUTO-HEAL] Attempt ${attempt} successful`);
      await logHealingAction(alert, 'SUCCESS', attempt);
      return true;
    } catch (err) {
      console.error(`[AUTO-HEAL] Attempt ${attempt} failed:`, err);
      await delay(rule.retryDelayMs);
    }
  }
  
  console.error(`[AUTO-HEAL] All attempts exhausted for ${alert.name}`);
  await logHealingAction(alert, 'FAILED', rule.retryCount);
  await escalateAlert(alert);
  return false;
}
```

---

# 6. VISUAL DESIGN

## 6.1 Color Scheme

```css
:root {
  /* Status Colors */
  --color-healthy: #10b981;    /* Emerald 500 */
  --color-warning: #f59e0b;    /* Amber 500 */
  --color-critical: #ef4444;   /* Red 500 */
  --color-info: #3b82f6;      /* Blue 500 */
  
  /* Background */
  --bg-primary: #050505;
  --bg-secondary: #0a0a0a;
  --bg-card: rgba(255, 255, 255, 0.02);
  --bg-card-hover: rgba(255, 255, 255, 0.04);
  
  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.05);
  --border-default: rgba(255, 255, 255, 0.1);
  
  /* Text */
  --text-primary: #E4E3E0;
  --text-secondary: #A1A1AA;
  --text-muted: #71717A;
  
  /* Glow Effects */
  --glow-healthy: 0 0 20px rgba(16, 185, 129, 0.4);
  --glow-warning: 0 0 20px rgba(245, 158, 11, 0.4);
  --glow-critical: 0 0 20px rgba(239, 68, 68, 0.4);
}
```

## 6.2 Animation Guidelines

```css
/* Pulse Animation for Active Status */
@keyframes pulse-healthy {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.animate-pulse-healthy {
  animation: pulse-healthy 2s ease-in-out infinite;
}

/* Glow Pulse for Critical */
@keyframes glow-critical {
  0%, 100% { box-shadow: 0 0 5px rgba(239, 68, 68, 0.5); }
  50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.8); }
}

/* Slide-in for Alerts */
@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

---

# 7. SCREEN LAYOUT

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│  TRINITY APEX CONTROL CENTER                          [Status Bar] System: ONLINE ●        │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ NODE A INFRASTRUCTURE                                        Last Update: 12:34:56.789 │  │
│  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │  │
│  │ │  gRPC STREAM │ │SHREDSTREAM  │ │CORE2 HOTPATH │ │CORE5 VLAN TX │                 │  │
│  │ │   ● HEALTHY  │ │  ● ACTIVE   │ │  ● HEALTHY  │ │  ● HEALTHY  │                 │  │
│  │ │              │ │             │ │             │ │              │                 │  │
│  │ │ Err: 0.0001%│ │Slot: 12345 │ │Rate: 100.00%│ │Sent: 3.2M    │                 │  │
│  │ │ Tx: 319M    │ │Gaps: 0     │ │Err: 0       │ │Err: 0       │                 │  │
│  │ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                 │  │
│  │                                                                                       │  │
│  │ BUFFER DIFF: [████████████████████] 0.01%                                              │  │
│  └─────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ NODE B ANALYTICS                                           Last Update: 12:34:56.789 │  │
│  │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                 │  │
│  │ │UDP :8002     │ │NETWORK       │ │ML INFERENCE  │ │TELEMETRY     │                 │  │
│  │ │   ● OPEN     │ │  ● HEALTHY   │ │  ● ACTIVE   │ │  ● HEALTHY  │                 │  │
│  │ │              │ │             │ │             │ │              │                 │  │
│  │ │Pkt: 1.2M/s  │ │Lat: 12ms    │ │Queue: 45    │ │Wrt: 0.2M    │                 │  │
│  │ │Loss: 0.00%  │ │Jit: 3ms     │ │Last: 2s ago │ │Err: 0       │                 │  │
│  │ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                 │  │
│  └─────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ SHARED MEMORY /dev/shm/kas_pa_features                                              │  │
│  │ MAGIC: ✓ VALID  │ VER: 1 │ HEAD: 0x1234 │ TS: 0.2s │ SLOT: 99.9% │ VALID: TRUE     │  │
│  │ FEATURES: [▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁▂▃▄▅▆▇█▇▆▅▄▃▂▁]                          │  │
│  └─────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                             │
│  ┌───────────────────────────────────┐ ┌───────────────────────────────────────────────┐  │
│  │ ⚠️ ALERTS & SOLUTIONS             │ │ 📈 HISTORICAL TRENDS                         │  │
│  │                                    │ │                                               │  │
│  │ ┌────────────────────────────────┐ │ │ Throughput    Error Rate    Latency   Buffer │  │
│  │ │ 🔴 gRPC Error Rate Warning    │ │ │                                               │  │
│  │ │    Rate: 0.015% (threshold)   │ │ │ ████████████  ▁           ▂         ▁        │  │
│  │ │    Root: Network instability  │ │ │ ████████████  ▁           ▂         ▁        │  │
│  │ │    💡 SOLUTION: Monitor      │ │ │ ████████████  ▁           ▂         ▁        │  │
│  │ │    [ACK] [AUTO-FIX]          │ │ │ ████████████  ▁           ▂         ▁        │  │
│  │ └────────────────────────────────┘ │ │                                               │  │
│  │                                    │ │ 100tx/s     0.001%        15ms      0.05%   │  │
│  │ ✓ All other systems operational   │ │                                               │  │
│  └───────────────────────────────────┘ └───────────────────────────────────────────────┘  │
│                                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ SYSTEM HEALTH         Redis: ● OK (2ms)  │  DuckDB: ● OK  │  KillSwitch: ○ OFF    │  │
│  │ CPU: 45%  │  MEM: 8.2/16GB  │  Overfitting Risk: 12%                                   │  │
│  └─────────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 8. IMPLEMENTATION PRIORITÄT

## Phase 1: Core Monitoring (1 Tag)
- [ ] Backend API Endpoints für Node A/B Metrics
- [ ] Shared Memory Reader
- [ ] Alert Detection Engine
- [ ] Basic React Dashboard

## Phase 2: Visualization (1 Tag)
- [ ] Node A/B Metric Cards
- [ ] Shared Memory Visualizer
- [ ] Alert Panel mit Solutions
- [ ] Trend Charts

## Phase 3: Auto-Healing (2 Tage)
- [ ] Auto-Heal Engine
- [ ] Solution Execution
- [ ] Escalation Logic
- [ ] Healing Logs

## Phase 4: Polish (1 Tag)
- [ ] Animations & Transitions
- [ ] Sound Alerts (optional)
- [ ] Mobile Responsive
- [ ] Dark Mode

---

*TRINITY CONTROL CENTER SPEC // VERSION 1.0*
*ERSTELLT: 2026-04-07*
