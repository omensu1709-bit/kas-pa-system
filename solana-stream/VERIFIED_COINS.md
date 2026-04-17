# KAS PA - VERIFIED LEVERAGE COINS
## Stand: 2026-04-11
## Verifizierung: Jupiter Price API v3

---

## ERGEBNIS: NUR 4/20 COINS FUNKTIONIEREND

### ✅ VERIFIZIERTE COINS (via Jupiter API)

| Symbol | Mint Address | Max Leverage | API Status | Live Price |
|--------|-------------|-------------|------------|------------|
| SOL | So11111111111111111111111111111111111111112 | 250x | ✅ VERIFIED | $84.38 |
| BTC | 9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E | 250x | ✅ VERIFIED | $72,750 |
| ETH | 7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs | 250x | ✅ VERIFIED | $2,240 |
| BONK | DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 | 20x | ✅ VERIFIED | $0.00000585 |

---

## ❌ NICHT VERFÜGBARE COINS

| Symbol | Mint Address | Problem |
|--------|-------------|---------|
| WIF | EKpQGSJtjMFqFK9v1ZfG4s7T7TnKhwK5V4mVWcqDmK4x | Nicht in Jupiter API |
| POPCAT | ZY2uFTwfwYdDdJ1HvHQEgUkDbsgDsvz9v1hQUrdZN2a | Nicht in Jupiter API |
| MOTHER | 3S8q2FRn2jScFC4aswxcQQGFvDjkgAxtdLPEW6iM5Y5 | Nicht in Jupiter API |
| FWOG | FdgqRzjH6RnXyoJzx5Bbm1hdxaEQ6W1yEBZnY6gWRYq | Nicht in Jupiter API |
| SLERF | SLERFB7wtoeeMu6t2U3u7J5KXjAacPiFN7bFc1yNgDm | Nicht in Jupiter API |
| BOME | 5voS3evTmxRcjXLgEj3Kn4J2A6aEfN6sN4o7r6K7pQ9x | Nicht in Jupiter API |
| AI16Z | HeKp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC | Nicht in Jupiter API |
| JTO | JTOESSENTIALS | Nicht in Jupiter API |
| JUP | JUP | Nicht in Jupiter API |
| PYTH | Pyth | Nicht in Jupiter API |
| WEN | WEN | Nicht in Jupiter API |
| LISTA | LISTA | Nicht in Jupiter API |
| SANTA | SANTA | Nicht in Jupiter API |
| CHEX | CHEkMNGzk2noe7M2KENvPyL1N5a9uS5so2bE5QfTNXy | Nicht in Jupiter API |
| AMP | AMP | Nicht in Jupiter API |
| SLEEPEE | SLEEPEE | Nicht in Jupiter API |

---

## FAZIT

### Ranking System Problem:

Das Ranking zeigt für nicht-verifizierte Coins:
- **Volatility:** Default 85 (statt live)
- **24h Change:** 0.0% (statt live)
- **Score:** 63% basierend auf Defaults

### Lösung Optionen:

1. **Nur verifizierte Coins nutzen** (4 Coins)
2. **Alternative APIs** (CoinGecko - rate-limited)
3. **Drift API direkt** für Memecoin-Preise
4. **Fallback zu 0/Default** für unverifizierte Coins

---

## CHAINSTACK LIMIT

- **50 Accounts** verfügbar
- **4 Coins** mit Live-API
- **16 Accounts** für weitere Nutzung verfügbar

---
