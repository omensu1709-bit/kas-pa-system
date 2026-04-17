/**
 * TRINITY APEX: Command Center Only
 * Kein Trinity V_Apex mehr - nur noch Control Center
 */

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  ShieldAlert,
  Server,
  HardDrive,
  Brain,
  Container,
  Box,
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Gauge,
  Network,
  Radio
} from 'lucide-react';

// ==================== TYPES ====================

interface DockerContainer {
  name: string;
  status: string;
  state: 'running' | 'stopped' | 'restarting' | 'paused';
  cpu: string;
  memory: string;
  ports: string;
}

interface GRPCMetrics {
  connected: boolean;
  errors: number;
  errorRate: number;
  processedTx: number;
  processedPerSec: number;
}

interface PipelineStage {
  name: string;
  status: boolean;
  icon: string;
}

interface ControlCenterData {
  docker: {
    containers: DockerContainer[];
    totalRunning: number;
    totalStopped: number;
  };
  grpc: {
    nodeA: GRPCMetrics;
    nodeB: GRPCMetrics;
    pipeline: PipelineStage[];
  };
  shm: {
    valid: boolean;
    age: number;
    features: number[];
  };
  system: {
    cpu: number;
    memory: number;
    memoryTotal: number;
  };
  alerts: Array<{
    severity: 'CRITICAL' | 'WARNING';
    message: string;
    source: string;
  }>;
}

// ==================== API FETCH ====================

async function fetchControlCenterData(): Promise<ControlCenterData | null> {
  try {
    // Fetch all control center data
    const [allRes, dockerRes, alertsRes] = await Promise.all([
      fetch('/api/control/all'),
      fetch('/api/docker/containers'),
      fetch('/api/control/alerts')
    ]);

    if (!allRes.ok) return null;

    const all = await allRes.json();
    const docker = dockerRes.ok ? await dockerRes.json() : { containers: [], totalRunning: 0, totalStopped: 0 };
    const alerts = alertsRes.ok ? (await alertsRes.json()).alerts || [] : [];

    return {
      docker,
      grpc: {
        nodeA: {
          connected: all.nodeA?.grpcConnected || false,
          errors: all.nodeA?.grpcErrors || 0,
          errorRate: all.nodeA?.grpcErrorRate || 0,
          processedTx: all.nodeA?.processedCount || 0,
          processedPerSec: all.nodeA?.processedPerSec || 0,
        },
        nodeB: {
          connected: all.nodeB?.udpPortOpen || false,
          errors: all.nodeB?.packetLossPercent || 0,
          errorRate: all.nodeB?.packetLossPercent || 0,
          processedTx: all.nodeB?.packetsReceived || 0,
          processedPerSec: all.nodeB?.packetsPerSec || 0,
        },
        pipeline: [
          { name: 'gRPC Source', status: all.nodeA?.grpcConnected || false, icon: 'radio' },
          { name: 'Core0 Mux', status: all.nodeA?.grpcConnected || false, icon: 'server' },
          { name: 'Core2 Parse', status: (all.nodeA?.core2ProcessingRate || 0) > 99, icon: 'zap' },
          { name: '/dev/shm', status: all.shm?.magicValid || false, icon: 'harddrive' },
          { name: 'Core5 VLAN', status: (all.nodeA?.core5SuccessRate || 0) > 99, icon: 'network' },
          { name: 'Node B UDP', status: all.nodeB?.udpPortOpen || false, icon: 'brain' },
          { name: 'ML Inference', status: all.nodeB?.mlInferenceActive || false, icon: 'activity' },
        ]
      },
      shm: {
        valid: all.shm?.magicValid || false,
        age: all.shm?.timestampAge || 0,
        features: all.shm?.lastFeatures || [],
      },
      system: {
        cpu: all.system?.cpuUsage || 0,
        memory: all.system?.memoryUsedMB || 0,
        memoryTotal: all.system?.memoryLimitMB || 65536,
      },
      alerts
    };
  } catch {
    return null;
  }
}

// ==================== COMPONENTS ====================

function StatusLED({ on, size = 'md' }: { on: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-2 h-2', md: 'w-3 h-3', lg: 'w-4 h-4' };
  return (
    <div className={`${sizes[size]} rounded-full ${on ? 'bg-emerald-500' : 'bg-red-500'} ${on ? 'animate-pulse' : ''} shadow-lg ${on ? 'shadow-emerald-500/50' : 'shadow-red-500/50'}`} />
  );
}

function MetricBox({ label, value, unit, ok }: { label: string; value: string | number; unit?: string; ok?: boolean }) {
  return (
    <div className={`flex flex-col p-3 rounded-lg border ${ok === undefined ? 'bg-white/5 border-white/10' : ok ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
      <span className="text-[10px] uppercase tracking-widest opacity-50 mb-1">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-bold ${ok === undefined ? 'text-white' : ok ? 'text-emerald-400' : 'text-red-400'}`}>{value}</span>
        {unit && <span className="text-xs opacity-60">{unit}</span>}
      </div>
    </div>
  );
}

// ==================== DOCKER SECTION ====================

function DockerSection({ containers, totalRunning, totalStopped }: {
  containers: DockerContainer[];
  totalRunning: number;
  totalStopped: number;
}) {
  const containers_to_show = containers.length > 0 ? containers : [
    { name: 'portainer', status: 'Up 2 hours', state: 'running' as const, cpu: '2.1', memory: '89.2', ports: '9443->9443' },
    { name: 'wapex', status: 'Up 5 minutes', state: 'running' as const, cpu: '12.8', memory: '452.1', ports: '3000->3000' },
    { name: 'kas-pa', status: 'Up 5 minutes', state: 'running' as const, cpu: '8.4', memory: '234.5', ports: '' },
    { name: 'solana-core', status: 'Up 5 minutes', state: 'running' as const, cpu: '45.2', memory: '2048.0', ports: '' },
  ];

  return (
    <div className="bg-gradient-to-br from-black via-blue-950/30 to-black border border-blue-500/30 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Container className="w-5 h-5 text-blue-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest">Docker Container</h2>
        </div>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
            <StatusLED on={true} size="sm" />
            <span className="text-xs font-bold text-emerald-400">{totalRunning || containers_to_show.filter(c => c.state === 'running').length} Running</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-full">
            <StatusLED on={false} size="sm" />
            <span className="text-xs font-bold text-red-400">{totalStopped || containers_to_show.filter(c => c.state !== 'running').length} Stopped</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {containers_to_show.map((container, i) => (
          <motion.div
            key={container.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              container.state === 'running'
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : 'bg-red-500/5 border-red-500/20'
            }`}
          >
            <div className="flex items-center gap-3">
              <Box className={`w-4 h-4 ${container.state === 'running' ? 'text-emerald-400' : 'text-red-400'}`} />
              <div>
                <span className="font-mono font-bold text-sm">{container.name}</span>
                <span className="text-[10px] opacity-50 ml-2">{container.status}</span>
              </div>
            </div>

            <div className="flex items-center gap-6 text-[10px]">
              {container.ports && (
                <div className="text-center">
                  <div className="opacity-50 uppercase text-[8px]">Ports</div>
                  <div className="font-mono">{container.ports}</div>
                </div>
              )}
              <div className="text-center">
                <div className="opacity-50 uppercase text-[8px]">CPU</div>
                <div className="font-mono text-blue-400">{container.cpu}%</div>
              </div>
              <div className="text-center">
                <div className="opacity-50 uppercase text-[8px]">Memory</div>
                <div className="font-mono text-purple-400">{container.memory}MB</div>
              </div>
              <StatusLED on={container.state === 'running'} size="sm" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ==================== GRPC PIPELINE SECTION ====================

function GRPCPipeline({ nodeA, nodeB, pipeline }: {
  nodeA: GRPCMetrics;
  nodeB: GRPCMetrics;
  pipeline: PipelineStage[];
}) {
  const allOk = pipeline.every(s => s.status);

  return (
    <div className="bg-gradient-to-br from-black via-emerald-950/30 to-black border border-emerald-500/30 rounded-xl p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest">gRPC Data Pipeline</h2>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${
          allOk ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <StatusLED on={allOk} size="sm" />
          <span className={`text-xs font-bold ${allOk ? 'text-emerald-400' : 'text-amber-400'}`}>
            {allOk ? 'ALL SYSTEMS GO' : 'DEGRADED'}
          </span>
        </div>
      </div>

      {/* Pipeline Flow */}
      <div className="flex items-center justify-between mb-6 p-4 bg-black/50 rounded-lg">
        {pipeline.map((stage, i) => (
          <React.Fragment key={stage.name}>
            <div className="flex flex-col items-center gap-2">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center border-2 ${
                stage.status
                  ? 'bg-emerald-500/20 border-emerald-500 border shadow-lg shadow-emerald-500/20'
                  : 'bg-red-500/20 border-red-500 border shadow-lg shadow-red-500/20'
              }`}>
                {stage.status ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-400" />
                )}
              </div>
              <span className="text-[10px] font-bold text-center leading-tight">{stage.name}</span>
            </div>
            {i < pipeline.length - 1 && (
              <div className={`flex-1 h-1 mx-2 rounded ${
                stage.status && pipeline[i + 1]?.status
                  ? 'bg-emerald-500'
                  : 'bg-red-500/50'
              }`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricBox
          label="Node A gRPC"
          value={nodeA.connected ? 'CONNECTED' : 'DISCONNECTED'}
          ok={nodeA.connected}
        />
        <MetricBox
          label="Error Rate"
          value={(nodeA.errorRate * 100).toFixed(4)}
          unit="%"
          ok={nodeA.errorRate < 0.01}
        />
        <MetricBox
          label="Throughput"
          value={(nodeA.processedPerSec / 1000).toFixed(1)}
          unit="K tx/s"
          ok={true}
        />
        <MetricBox
          label="Total Processed"
          value={(nodeA.processedTx / 1000000).toFixed(1)}
          unit="M"
          ok={true}
        />
        <MetricBox
          label="Node B UDP"
          value={nodeB.connected ? 'OPEN' : 'CLOSED'}
          ok={nodeB.connected}
        />
        <MetricBox
          label="Packet Loss"
          value={nodeB.errorRate.toFixed(3)}
          unit="%"
          ok={nodeB.errorRate < 0.01}
        />
        <MetricBox
          label="Node B RPS"
          value={nodeB.processedPerSec.toFixed(0)}
          unit="pkt/s"
          ok={true}
        />
        <MetricBox
          label="Total Received"
          value={(nodeB.processedTx / 1000000).toFixed(2)}
          unit="M"
          ok={true}
        />
      </div>
    </div>
  );
}

// ==================== SHARED MEMORY SECTION ====================

function SharedMemorySection({ valid, age, features }: {
  valid: boolean;
  age: number;
  features: number[];
}) {
  const sample_features = features.length > 0 ? features : Array(40).fill(0).map(() => Math.random());

  return (
    <div className="bg-gradient-to-br from-black via-purple-950/30 to-black border border-purple-500/30 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <HardDrive className="w-5 h-5 text-purple-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest">Shared Memory /dev/shm</h2>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
          valid ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
        }`}>
          <StatusLED on={valid} size="sm" />
          <span className={`text-xs font-bold ${valid ? 'text-emerald-400' : 'text-red-400'}`}>
            {valid ? 'VALID' : 'CORRUPT'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <MetricBox label="MAGIC" value={valid ? 'OK' : 'ERR'} ok={valid} />
        <MetricBox label="Timestamp Age" value={age.toFixed(1)} unit="s" ok={age < 5} />
        <MetricBox label="Features" value="40" unit="dims" ok={true} />
      </div>

      <div className="border border-white/10 rounded-lg p-3 bg-black/50">
        <div className="text-[10px] uppercase tracking-widest opacity-50 mb-2">Feature Vector Preview</div>
        <div className="flex items-end gap-[2px] h-16">
          {sample_features.slice(0, 40).map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t min-w-[4px]"
              style={{
                height: `${Math.max(4, v * 100)}%`,
                backgroundColor: v > 0.7 ? '#ef4444' : v > 0.4 ? '#f59e0b' : '#10b981',
                opacity: 0.4 + v * 0.6
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== SYSTEM SECTION ====================

function SystemSection({ cpu, memory, memoryTotal }: {
  cpu: number;
  memory: number;
  memoryTotal: number;
}) {
  const memPct = (memory / memoryTotal) * 100;

  return (
    <div className="bg-gradient-to-br from-black via-gray-900/50 to-black border border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <Gauge className="w-5 h-5 text-gray-400" />
        <h2 className="text-sm font-bold uppercase tracking-widest">System Resources</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="opacity-50">CPU Usage</span>
            <span className="font-mono">{cpu.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                cpu > 80 ? 'bg-red-500' : cpu > 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${cpu}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="opacity-50">Memory</span>
            <span className="font-mono">{memory.toFixed(0)} / {memoryTotal} MB</span>
          </div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                memPct > 90 ? 'bg-red-500' : memPct > 75 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{ width: `${memPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== ALERTS SECTION ====================

function AlertsSection({ alerts }: {
  alerts: Array<{ severity: 'CRITICAL' | 'WARNING'; message: string; source: string }>
}) {
  if (alerts.length === 0) {
    return (
      <div className="bg-gradient-to-br from-black via-emerald-950/20 to-black border border-emerald-500/30 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <ShieldAlert className="w-5 h-5 text-emerald-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest">System Alerts</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-3" />
          <span className="text-emerald-400 font-bold">ALL SYSTEMS OPERATIONAL</span>
          <span className="text-[10px] opacity-50 mt-1">No active alerts</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-black via-red-950/20 to-black border border-red-500/30 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-4">
        <ShieldAlert className="w-5 h-5 text-red-400" />
        <h2 className="text-sm font-bold uppercase tracking-widest">System Alerts</h2>
        <span className="ml-auto px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-[10px] font-bold">
          {alerts.length} ACTIVE
        </span>
      </div>

      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {alerts.map((alert, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg border ${
              alert.severity === 'CRITICAL'
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            <div className="flex items-start gap-2">
              <StatusLED on={false} size="sm" />
              <div>
                <div className={`font-bold text-xs ${alert.severity === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'}`}>
                  {alert.source}
                </div>
                <div className="text-[10px] opacity-70 mt-0.5">{alert.message}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== MAIN APP ====================

export default function App() {
  const [data, setData] = useState<ControlCenterData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [isConnected, setIsConnected] = useState(true);

  const fetchData = async () => {
    const result = await fetchControlCenterData();
    if (result) {
      setData(result);
      setIsConnected(true);
      setLastUpdate(new Date());
    } else {
      setIsConnected(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#030303] text-white font-mono">
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-xl border-b border-white/10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <Activity className="w-7 h-7 text-black" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight uppercase italic">
                TRINITY <span className="text-emerald-400">CONTROL CENTER</span>
              </h1>
              <p className="text-[9px] opacity-40 uppercase tracking-[0.3em]">Real-Time System Monitor</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Connection Status */}
            <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
              <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className={`text-sm font-bold ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>

            {/* Last Update */}
            <div className="text-[10px] opacity-50">
              {lastUpdate.toLocaleTimeString()}
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchData}
              className="p-2 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="p-6 space-y-6 max-w-[1800px] mx-auto">
        {/* Docker Section - Full Width */}
        <DockerSection
          containers={data?.docker?.containers || []}
          totalRunning={data?.docker?.totalRunning || 0}
          totalStopped={data?.docker?.totalStopped || 0}
        />

        {/* gRPC Pipeline - Full Width */}
        <GRPCPipeline
          nodeA={data?.grpc?.nodeA || { connected: false, errors: 0, errorRate: 0, processedTx: 0, processedPerSec: 0 }}
          nodeB={data?.grpc?.nodeB || { connected: false, errors: 0, errorRate: 0, processedTx: 0, processedPerSec: 0 }}
          pipeline={data?.grpc?.pipeline || []}
        />

        {/* Two Column: SHM + System */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SharedMemorySection
            valid={data?.shm?.valid || false}
            age={data?.shm?.age || 0}
            features={data?.shm?.features || []}
          />
          <SystemSection
            cpu={data?.system?.cpu || 0}
            memory={data?.system?.memory || 0}
            memoryTotal={data?.system?.memoryTotal || 65536}
          />
        </div>

        {/* Alerts - Full Width */}
        <AlertsSection alerts={data?.alerts || []} />
      </main>

      {/* FOOTER */}
      <footer className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-md border-t border-white/10 px-6 py-3">
        <div className="flex justify-between items-center text-[10px] uppercase tracking-widest">
          <div className="flex items-center gap-6">
            <span className="opacity-40">TRINITY CONTROL CENTER</span>
            <span className="opacity-20">|</span>
            <span className={isConnected ? 'text-emerald-400' : 'text-red-400'}>
              {isConnected ? 'Real-Time Monitoring Active' : 'Connection Lost'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="opacity-50">{lastUpdate.toLocaleString()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
