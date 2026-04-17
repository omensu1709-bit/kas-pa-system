# Paper Trading Engine

Manipulationssicheres Paper Trading System mit Blockchain-Verankerung und vollständigem Audit-Trail.

## Features

- **Hash-Chain**: Jeder Trade ist kryptographisch verknüpft
- **Blockchain-Verankerung**: Trades werden an Solana verankert
- **Multi-Source Oracle**: Preise von 3 unabhängigen Quellen
- **Anti-Manipulation Guards**: Schutz gegen System-Manipulation
- **Vollständiger Audit-Log**: Jede Aktion wird protokolliert
- **Investor Dashboard API**: Read-only Zugang für Investoren

## Installation

```bash
cd paper-trading
npm install
```

## Konfiguration

Erstelle eine `.env` Datei:

```bash
HELIUS_API_KEY=dein_api_key
RPC_ENDPOINT=https://api.mainnet-beta.solana.com
OPERATOR_PUBKEY=dein_pubkey
```

## Usage

```typescript
import { PaperTradingEngine, HeliusPriceSource, JupiterPriceSource } from './src/index.js';
import { Keypair } from '@solana/web3.js';

// Engine initialisieren
const engine = new PaperTradingEngine({
  startingCapital: 100, // SOL
  operatorPubkey: 'DeinPubkey',
  rpcEndpoint: 'https://api.mainnet-beta.solana.com',
  payerKeypair: Keypair.fromSeed(...),
  priceSources: [
    new HeliusPriceSource(process.env.HELIUS_API_KEY!),
    new JupiterPriceSource()
  ]
});

// Position öffnen
const result = await engine.openPosition(
  'MintAddress', // Token
  10,           // Amount
  'signal'      // Signal Source
);

// Position schließen
const closeResult = await engine.closePosition(
  'MintAddress',
  'TAKE_PROFIT'
);

// Performance abrufen
const perf = engine.getPerformance();

// Verifizieren
const verify = engine.verify();
```

## API Endpoints

Der Investor Dashboard API läuft auf Port 8081:

| Endpoint | Beschreibung |
|----------|--------------|
| `GET /health` | System Health |
| `GET /performance` | Performance Statistiken |
| `GET /positions` | Offene Positionen |
| `GET /trades` | Trade Historie |
| `GET /verify` | Verifizierung |
| `GET /export` | Daten Export |

## Verifikation

```bash
# Exportiere Daten
const data = engine.export();

// Oder mit CLI:
npm run verify ./export.json
```

## Sicherheits-Features

1. **Hash-Chain**: Jede Änderung bricht die Chain
2. **Blockchain-Anker**: Trades sind on-chain verankert
3. **Multi-Source Prices**: Median-Preise verhindern Manipulation
4. **Anti-Manipulation Guards**: Erkennen verdächtige Patterns
5. **Audit-Log**: Vollständige, unveränderliche Historie

## Lizenz

MIT
