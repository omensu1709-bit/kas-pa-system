# MEGA PROMPT: Perspective.js Integration Debug

## Problem Statement
Das Dashboard zeigt keine Live-Daten obwohl Backend einwandfrei funktioniert. Die React/TypeScript/StreamingTable-Komponente funktioniert, aber Perspective.js (WASM) will nicht.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  SOLANA STREAMING PIPELINE                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Chainstack RPC] ──► [live-paper-trading.ts] ──► [Port 8080] │
│       │                         │                    WebSocket    │
│       │                         │                       │        │
│       │                   [Ranking]                    │        │
│       │                   [Signals]                   │        │
│       │                                                 ▼        │
│       │                                    ┌─────────────────┐  │
│       │                                    │  Browser        │  │
│       │                                    │  ws://localhost │  │
│       │                                    └────────┬────────┘  │
│       │                                             │           │
│       │                                    ┌────────▼────────┐  │
│       │                                    │  Vite Dev      │  │
│       │                                    │  (Port 5173)   │  │
│       │                                    └─────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript
- **Build:** Vite 8.x + React 19
- **Backend:** tsx runner (TypeScript execute)
- **WebSocket:** `ws` library (Node.js native)
- **Database:** In-memory only
- **RPC:** Chainstack Solana API

## File Locations

```
/data/trinity_apex/
├── solana-stream/
│   ├── dashboard/                    # React Frontend
│   │   ├── src/
│   │   │   ├── App.tsx             # Main React component
│   │   │   ├── components/
│   │   │   │   └── PerspectiveViewer.tsx  # Current (StreamingTable)
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts          # Vite configuration
│   │   └── package.json
│   ├── paper-trading/               # Backend
│   │   ├── src/
│   │   │   ├── live-paper-trading.ts    # Main entry point
│   │   │   ├── ranking-service.ts        # Ranking logic
│   │   │   └── ...
│   │   └── package.json
│   └── scripts/
│       ├── 24h-supervisor.sh
│       ├── meta-watchdog.sh
│       └── ...
└── node_modules/
    └── @finos/
        └── perspective/            # Perspective.js packages
```

## Current State (Working Components)

### Backend (Port 8080) - ✅ WORKING
```bash
# Backend broadcasts every 30 seconds via WebSocket
# Message format:
{
  "type": "UPDATE",
  "performance": { ... },
  "latestPrediction": { crashProbability: 0.01, zone: "IGNORE", ... },
  "top10ShortTargets": [ ... ],
  "rankingTimestamp": 1775927890010,
  "timestamp": 1775927890011
}
```

### Dashboard (Port 5173) - ✅ WORKING
- React renders correctly
- WebSocket connects (shows "Connected" in logs)
- But React UI does NOT update with data

### StreamingTable Component - ✅ WORKING
```typescript
// /data/trinity_apex/solana-stream/dashboard/src/components/PerspectiveViewer.tsx
// This is a simple React table that works 100%
// Problem: Not receiving data from WebSocket handler
```

## FAILED: Perspective.js Integration

### What Was Tried

1. **CDN Loading (index.html)**
```html
<script src="https://cdn.jsdelivr.net/npm/@finos/perspective@3.0.3/dist/umd/perspective.js">
```
**Result:** Failed - CORS policy blocked

2. **ESM Dynamic Import**
```typescript
await import('@finos/perspective');
await import('@finos/perspective-viewer');
```
**Result:** Failed - `Timeout waiting for perspective-viewer element`

3. **CDN with loadScript function**
**Result:** Failed - `Failed to load perspective.js`

### Vite Config (Current)
```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  resolve: {
    alias: {
      '@fp': '/node_modules/@finos/perspective',
    },
  },
  optimizeDeps: {
    exclude: [
      '@finos/perspective',
      '@finos/perspective-viewer',
      '@finos/perspective-viewer-datagrid',
      '@finos/perspective-viewer-d3fc',
    ],
    include: ['chroma-js'],
  },
  worker: { format: 'es' },
  build: { target: 'esnext' },
})
```

## The Debugging Challenge

### Goal
Integrate Perspective.js (WASM) into Vite/React for SOTA streaming data visualization.

### Known Issues
1. Perspective.js requires WASM files
2. Custom elements need to be registered
3. Vite's optimization interferes with WASM loading
4. COOP/COEP headers may be required

### Questions to Solve
1. How to properly configure Vite for @finos/perspective?
2. How to load WASM files correctly in Vite dev mode?
3. How to register perspective-viewer custom element?
4. How to handle the "Timeout waiting for perspective-viewer element" error?
5. Alternative: Use @finos/perspective-viewer without WASM (CDN)?

## Installation Evidence

```bash
# npm ls in dashboard folder shows:
@aspect/build@0.0.0 -> /data/trinity_apex/solana-stream/dashboard
@vitejs/plugin-react@4.0.0
react@19.0.0
react-dom@19.0.0

# But @finos packages NOT in package.json!
# They might be in root node_modules
```

## Key Files Content

### /data/trinity_apex/solana-stream/dashboard/package.json
```json
{
  "name": "dashboard",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "~5.6.0",
    "vite": "^8.0.0"
  }
}
```

### Current PerspectiveViewer.tsx (Working Simple Version)
```typescript
import { useEffect, useRef, useState } from 'react';

interface Props {
  data: Record<string, any>[];
  schema: Record<string, string>;
  className?: string;
}

export default function DataTable({ data, className = '' }: Props) {
  const [rows, setRows] = useState<Record<string, any>[]>([]);

  useEffect(() => {
    if (data.length > 0) {
      setRows(prev => [...prev, ...data].slice(-500));
    }
  }, [data]);

  if (rows.length === 0) {
    return (
      <div className={className}>
        <p>Waiting for data...</p>
        <p>Connect to backend on port 8080</p>
      </div>
    );
  }

  const columns = Object.keys(rows[0] || {});

  return (
    <div className={className}>
      <div>Rows: {rows.length} | Updated: {new Date().toLocaleTimeString()}</div>
      <table>
        <thead>
          <tr>
            {columns.map(col => <th key={col}>{col}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.slice(-50).reverse().map((row, i) => (
            <tr key={i}>
              {columns.map(col => (
                <td key={col}>
                  {typeof row[col] === 'number' ? row[col].toFixed(6) : String(row[col])}
                </td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

## Perspective.js Official Resources

### CDN URLs (Unofficial - Try at own risk)
```
https://cdn.jsdelivr.net/npm/@finos/perspective@3.0.0/dist/umd/perspective.js
https://cdn.jsdelivr.net/npm/@finos/perspective-viewer@3.0.0/dist/umd/perspective-viewer.js
https://cdn.jsdelivr.net/npm/@finos/perspective-viewer-datagrid@3.0.0/dist/umd/perspective-viewer-datagrid.js
https://cdn.jsdelivr.net/npm/@finos/perspective-viewer@3.0.0/dist/css/pro.css
```

### Perspective.js GitHub
- https://github.com/finos/perspective
- Examples for Vite: https://github.com/finos/perspective/tree/master/examples

### Perspective.js NPM
```
@finos/perspective        # Core WASM engine
@finos/perspective-viewer  # Web Component
@finos/perspective-viewer-datagrid  # Datasource plugin
```

## Quick Fix Options

### Option 1: Use Perspective.js CDN (Recommended for Debug)
```typescript
// In index.html, add before </body>:
// <script type="module" src="https://cdn.jsdelivr.net/npm/@finos/perspective@3.0.0/dist/umd/perspective.js"></script>

// Then in component:
useEffect(() => {
  import('https://cdn.jsdelivr.net/npm/@finos/perspective-viewer@3.0.0/dist/umd/perspective-viewer.js').then(() => {
    // Custom element should be available
  });
}, []);
```

### Option 2: Install @finos Packages
```bash
cd /data/trinity_apex/solana-stream/dashboard
npm install @finos/perspective @finos/perspective-viewer @finos/perspective-viewer-datagrid
```

### Option 3: Use Alternative (AG Grid, TanStack Table)
```bash
npm install @tanstack/react-table
# or
npm install ag-grid-community ag-grid-react
```

## Environment Info

```bash
# Node version
node --version  # v20.x+

# NPM version
npm --version   # 10.x+

# OS
Linux 6.8.0-106-generic (Ubuntu/Debian)

# Architecture
x86_64
```

## Debug Commands

```bash
# Check if @finos packages exist
ls /data/trinity_apex/node_modules/@finos/ 2>/dev/null

# Check Perspective.js installation
find /data/trinity_apex -name "perspective.js" 2>/dev/null

# Test backend WebSocket
node -e "const ws = require('ws'); const c = new ws('ws://localhost:8080'); c.on('open', () => console.log('OK'));"

# Check Vite dependencies
cd /data/trinity_apex/solana-stream/dashboard
npm ls

# View current PerspectiveViewer
cat /data/trinity_apex/solana-stream/dashboard/src/components/PerspectiveViewer.tsx
```

## Success Criteria

1. Perspective.js loads without errors
2. `perspective-viewer` custom element is registered
3. Table receives data from WebSocket
4. Streaming updates work in real-time
5. No CORS/WASM loading errors

## What NOT to Do

1. Do NOT modify backend (it's working)
2. Do NOT use complex build configurations
3. Do NOT add unnecessary dependencies
4. Do NOT ignore browser console errors
5. Do NOT skip testing with minimal code

---

**Generated:** 2026-04-11
**System:** KAS PA Crash Prediction Dashboard
**Status:** Perspective.js integration incomplete - needs expert help
