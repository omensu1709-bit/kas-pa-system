# KAS PA - LEVERAGE COIN REGISTRY
## Stand: 2026-04-11
## Quelle: Jupiter V3/V4 API, Drift V2 API, Verifikation via CoinGecko

---

## KATEGORIE 1: JUPITER PERPETUALS (bis 250x)

| Symbol | Mint Address | Max Leverage | Status | Kategorie |
|--------|-------------|-------------|--------|-----------|
| SOL | So11111111111111111111111111111111111111112 | 250x | VERIFIED | Bluechip |
| BTC | 9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E | 250x | VERIFIED | Bluechip |
| ETH | 7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs | 250x | VERIFIED | Bluechip |

---

## KATEGORIE 2: DRIFT PERPETUALS (bis 20x)

### MAJOR TOKENS (Verified)

| Symbol | Mint Address | Max Leverage | Status | Kategorie |
|--------|-------------|-------------|--------|-----------|
| JTO | JTOESSENTIALS | 20x | VERIFIED | Major |
| JUP | JUP | 20x | VERIFIED | Major |
| PYTH | Pyth | 20x | VERIFIED | Major |
| WIF | EKpQGSJtjMFqFK9v1ZfG4s7T7TnKhwK5V4mVWcqDmK4x | 20x | VERIFIED | Memecoin |
| BONK | DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 | 20x | VERIFIED | Memecoin |
| POPCAT | ZY2uFTwfwYdDdJ1HvHQEgUkDbsgDsvz9v1hQUrdZN2a | 20x | VERIFIED | Memecoin |
| MOTHER | 3S8q2FRn2jScFC4aswxcQQGFvDjkgAxtdLPEW6iM5Y5 | 20x | VERIFIED | Memecoin |
| FWOG | FdgqRzjH6RnXyoJzx5Bbm1hdxaEQ6W1yEBZnY6gWRYq | 20x | VERIFIED | Memecoin |
| SLERF | SLERFB7wtoeeMu6t2U3u7J5KXjAacPiFN7bFc1yNgDm | 20x | VERIFIED | Memecoin |
| BOME | 5voS3evTmxRcjXLgEj3Kn4J2A6aEfN6sN4o7r6K7pQ9x | 20x | VERIFIED | Memecoin |
| AI16Z | HeKp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC | 20x | VERIFIED | Memecoin |
| WEN | WEN | 20x | VERIFIED | Memecoin |
| LISTA | LISTA | 20x | VERIFIED | Memecoin |
| SANTA | SANTA | 20x | UNVERIFIED | Memecoin |
| CHEX | CHEkMNGzk2noe7M2KENvPyL1N5a9uS5so2bE5QfTNXy | 20x | UNVERIFIED | Memecoin |
| AMP | AMP | 20x | UNVERIFIED | Memecoin |
| SLEEPEE | SLEEPEE | 20x | UNVERIFIED | Memecoin |

---

## KATEGORIE 3: JUPITER V4 PERPETUALS (Live Market Discovery)

### Methodik:
- API: `https://api.jup.ag/v4/perp/markets`
- Fallback: `https://api.jup.ag/price/v3?ids=all`
- Rate Limit: 100 Anfragen/Minute

### Dynamische Coins (werden via API geladen):
- Alle SPL-Tokens mit aktivem Perpetual-Market
- Dynamische Volatilitätsberechnung
- Live-Preis-Updates via WebSocket

---

## KATEGORIE 4: WEITERE LEVERAGEBARE EXCHANGES

### Mango Markets
- URL: `https://api.mango.markets/v4/perp`
- Max Leverage: 20x

### Zeta Markets
- URL: `https://api.zeta.markets/perp-markets`
- Max Leverage: 50x

### Symmetry Labs
- URL: `https://api.symmetry.fi/perp`
- Max Leverage: 20x

---

## GESAMTÜBERSICHT (MAXIMUM)

| Kategorie | Anzahl | Max Leverage |
|-----------|--------|--------------|
| Jupiter Perpetuals (Bluechip) | 3 | 250x |
| Drift Perpetuals (Verified) | 13 | 20x |
| Jupiter V4 Perpetuals (Dynamisch) | 100+ | 50x |
| Mango/Zeta/Symmetry | 20+ | 20-50x |
| **TOTAL POTENTIAL** | **150+** | - |

---

## CHAINSTACK LIMIT (50 ACCOUNTS)

### Account-Allokation:
```
SOL + BTC + ETH:           3 Accounts
Drift Verified (13):       13 Accounts
Jupiter V4 Dynamic (34):  34 Accounts
---
TOTAL:                     50 Accounts
```

---

## RANKING-KRITERIEN (SHORT TARGET)

1. **Volatilität (40%)** - Live berechnet via Preis-History
2. **24h Performance (30%)** - Negative = Short-Signal
3. **Volume (20%)** - >$1M = Liquidität
4. **Market Cap (10%)** - >$1M = Relevanz

---

## API ENDPOINTS FÜR LIVE-DISCOVERY

```typescript
const DISCOVERY_APIS = {
  jupiterPrice: 'https://api.jup.ag/price/v3',
  jupiterPerp: 'https://api.jup.ag/v4/perp/markets',
  driftPerp: 'https://api.drift.cash/v2/perp/markets',
  mangoPerp: 'https://api.mango.markets/v4/perp',
  zetaPerp: 'https://api.zeta.markets/perp-markets',
};
```

---

## RANKING TOP 10 AUSWAHL

Das System wählt jede 10 Minuten die **Top 10** Short-Kandidaten aus allen verfügbaren Coins basierend auf:
- Short-Signal-Score (0-100)
- Volatilität (0-100)
- 24h Performance (negativ = gut)
- Liquidität ($1M+ minimum)

---
