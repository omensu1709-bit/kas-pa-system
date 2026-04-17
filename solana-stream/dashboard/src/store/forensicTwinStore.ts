/**
 * KAS PA System Store - Forensic Visual Twin State Management
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Edge, Node } from '@xyflow/react';

export type NodeStatus = 'active' | 'idle' | 'error' | 'degraded' | 'processing';

export interface ForensicNode {
  id: string;
  type: string;
  status: NodeStatus;
  metrics: { throughput: number; latency: number; errorRate: number; lastSeen: number };
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface EdgeState {
  id: string;
  source: string;
  target: string;
  status: 'active' | 'idle' | 'broken' | 'saturated';
  throughput: number;
  packetLoss: number;
  animated: boolean;
}

interface ForensicStore {
  nodeRegistry: Map<string, ForensicNode>;
  edgeRegistry: Map<string, EdgeState>;
  rfNodes: Node[];
  rfEdges: Edge[];
  edgeTopology: Array<{ source: string; target: string; id: string }>;
  updateNodeStatus: (nodeId: string, patch: Partial<ForensicNode>) => void;
  updateEdgeStatus: (edgeId: string, patch: Partial<EdgeState>) => void;
  batchUpdateFromWebSocket: (payload: any) => void;
  recomputeEdges: () => void;
  setEdgeTopology: (topology: ForensicStore['edgeTopology']) => void;
}

export const useForensicStore = create<ForensicStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      nodeRegistry: new Map(),
      edgeRegistry: new Map(),
      rfNodes: [],
      rfEdges: [],
      edgeTopology: [],
      setEdgeTopology: (topology) => {
        set((state) => {
          state.edgeTopology = topology;
          topology.forEach(({ id, source, target }) => {
            if (!state.edgeRegistry.has(id)) {
              state.edgeRegistry.set(id, { id, source, target, status: 'idle', throughput: 0, packetLoss: 0, animated: false });
            }
          });
        });
        get().recomputeEdges();
      },
      updateNodeStatus: (nodeId, patch) => {
        set((state) => {
          const existing = state.nodeRegistry.get(nodeId);
          state.nodeRegistry.set(nodeId, existing ? { ...existing, ...patch } : patch as ForensicNode);
        });
        get().recomputeEdges();
      },
      updateEdgeStatus: (edgeId, patch) => {
        set((state) => {
          const existing = state.edgeRegistry.get(edgeId);
          if (existing) state.edgeRegistry.set(edgeId, { ...existing, ...patch });
        });
        get().recomputeEdges();
      },
      batchUpdateFromWebSocket: (payload) => {
        set((state) => {
          payload.nodes?.forEach((nu: any) => {
            const ex = state.nodeRegistry.get(nu.id);
            state.nodeRegistry.set(nu.id, ex ? { ...ex, ...nu, metrics: { ...ex.metrics, ...nu.metrics, lastSeen: payload.timestamp } } : nu);
          });
          payload.edges?.forEach((eu: any) => {
            const ex = state.edgeRegistry.get(eu.id);
            if (ex) state.edgeRegistry.set(eu.id, { ...ex, ...eu });
          });
        });
        get().recomputeEdges();
      },
      recomputeEdges: () => {
        const { nodeRegistry, edgeTopology } = get();
        const rfNodes = Array.from(nodeRegistry.values()).map((n) => ({ id: n.id, type: 'forensicNode', position: n.position, data: n }));
        const rfEdges = edgeTopology.map(({ id, source, target }) => {
          const sNode = nodeRegistry.get(source);
          const tNode = nodeRegistry.get(target);
          const status = (!sNode || !tNode) ? 'broken' : (sNode.status === 'active' && tNode.status === 'active' ? 'active' : 'idle');
          return { id, source, target, type: 'forensicEdge', data: { status }, style: { stroke: status === 'active' ? '#00ff88' : '#4a5568' } };
        });
        set((state) => { state.rfNodes = rfNodes; state.rfEdges = rfEdges; });
      }
    }))
  )
);
