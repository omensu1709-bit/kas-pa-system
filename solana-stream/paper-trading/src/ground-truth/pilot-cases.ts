/**
 * Pilot Review — 10 Testfälle
 * KAS PA v4.3 Ground-Truth System
 *
 * Design-Prinzipien:
 * - Keine Token-Namen, keine Ticker im exportierten Blind-Paket
 * - eventId: EVT-P01 bis EVT-P10 (anonymisiert)
 * - windowStart/End: reale Zeitfenster aber ohne Token-Kontext
 * - _internal enthält designed Label + Modell-Output (erst nach Review zeigen)
 *
 * Verteilung:
 *   EVT-P01, EVT-P02 → MASSIVE_DUMP (klar)
 *   EVT-P03, EVT-P04 → NORMAL_VOLATILITY (klar)
 *   EVT-P05, EVT-P06 → ILLIQUID_RANDOM_MOVE (wahrscheinlich)
 *   EVT-P07, EVT-P08 → WHALE_SELL_NO_CASCADE / BOT_ACTIVITY_NO_PRICE_IMPACT
 *   EVT-P09, EVT-P10 → Grenzfälle (schwierig)
 */

import type { PilotEventFull } from './review-types.js';

export const PILOT_CASES: PilotEventFull[] = [

  // ─── EVT-P01: MASSIVE_DUMP (klar) ─────────────────────────────────────────
  {
    eventId: 'EVT-P01',
    windowStart: '2026-04-10T14:00:00Z',
    windowEnd:   '2026-04-10T15:00:00Z',
    metrics: {
      n: 0.94,        // SEHR HOCH — gefährlich
      PE: 0.18,       // SEHR NIEDRIG — gefährlich
      kappa: 1.4,     // NIEDRIG — gefährlich
      fragmentation: 0.83, // HOCH — gefährlich
      rt: 2.1,        // HOCH — gefährlich
      bValue: 0.61,   // NIEDRIG — gefährlich
      CTE: 0.78,      // HOCH — gefährlich
      SSI: 9.2,       // SEHR HOCH — gefährlich
      LFI: 3.8,       // HOCH — gefährlich
    },
    price: {
      priceChangePct60min: -38.4,
      priceChange1min: -11.2,
      priceChange5min: -24.7,
      acceleration: 4.8,
      isFlashCrash: false,
      lowestPricePct: -41.0,
      recoveryPct: 6.1,   // Kaum Erholung
    },
    volume: {
      buyVolumePct: 8.2,
      sellVolumePct: 91.8,
      volumeRatioVsBaseline: 12.4,
      orderBookDepthLevels: 7,
      spreadVsNormal: 4.2,
      totalTradesInWindow: 2847,
      largestSingleOrderPct: 3.1,
    },
    structure: {
      whaleWalletIdentified: false,
      whaleWalletSizePct: null,
      whaleTransactionSizePct: null,
      cascadeFollowsSellCount: 0,
      botProbability: 31,
      jitoBundleCount: 2,
      sandwichCount: 1,
      sniperCount: 0,
      arbitrageCount: 3,
      tradeFrequencyVsBaseline: 11.8,
    },
    dataQuality: {
      totalTrades: 2847,
      feedGapMinutes: 0.2,
      feedGapInCriticalWindow: false,
      metricsAvailable: 9,
      walletDataAvailable: true,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'MASSIVE_DUMP',
      designNotes: 'Alle 9 Metriken kritisch, 91.8% Sell-Volume, -38% in 60 Min, minimale Erholung. Klar MASSIVE_DUMP. Kein Whale. Kein Bot-Primärtreiber.',
      expectedDifficulty: 'CLEAR',
      knownConfusionRisk: [],
      modelZone: 'IMMEDIATE_SHORT',
      modelCrashProbability: 0.89,
      modelDetectionReason: 'Hawkes+PE+kappa+LFI alle kritisch, hohe Sell-Dominanz',
    },
  },

  // ─── EVT-P02: MASSIVE_DUMP (klar, schneller) ──────────────────────────────
  {
    eventId: 'EVT-P02',
    windowStart: '2026-04-12T09:15:00Z',
    windowEnd:   '2026-04-12T10:15:00Z',
    metrics: {
      n: 0.88,
      PE: 0.22,
      kappa: 1.9,
      fragmentation: 0.79,
      rt: 1.87,
      bValue: 0.72,
      CTE: 0.69,
      SSI: 7.1,
      LFI: 2.9,
    },
    price: {
      priceChangePct60min: -28.6,
      priceChange1min: -8.4,
      priceChange5min: -19.1,
      acceleration: 3.2,
      isFlashCrash: false,
      lowestPricePct: -31.2,
      recoveryPct: 9.4,
    },
    volume: {
      buyVolumePct: 14.3,
      sellVolumePct: 85.7,
      volumeRatioVsBaseline: 8.7,
      orderBookDepthLevels: 9,
      spreadVsNormal: 3.1,
      totalTradesInWindow: 1943,
      largestSingleOrderPct: 2.4,
    },
    structure: {
      whaleWalletIdentified: false,
      whaleWalletSizePct: null,
      whaleTransactionSizePct: null,
      cascadeFollowsSellCount: 0,
      botProbability: 28,
      jitoBundleCount: 1,
      sandwichCount: 2,
      sniperCount: 1,
      arbitrageCount: 2,
      tradeFrequencyVsBaseline: 8.3,
    },
    dataQuality: {
      totalTrades: 1943,
      feedGapMinutes: 0.0,
      feedGapInCriticalWindow: false,
      metricsAvailable: 9,
      walletDataAvailable: true,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'MASSIVE_DUMP',
      designNotes: '8/9 Metriken kritisch, 85.7% Sell, -28.6% in 60 Min. Koordinierter Markt-Sell ohne einzelnen Whale.',
      expectedDifficulty: 'CLEAR',
      knownConfusionRisk: [],
      modelZone: 'IMMEDIATE_SHORT',
      modelCrashProbability: 0.82,
      modelDetectionReason: 'Sell-Dominanz + PE + kappa + rt kritisch',
    },
  },

  // ─── EVT-P03: NORMAL_VOLATILITY (klar) ────────────────────────────────────
  {
    eventId: 'EVT-P03',
    windowStart: '2026-04-11T18:00:00Z',
    windowEnd:   '2026-04-11T19:00:00Z',
    metrics: {
      n: 0.42,
      PE: 0.71,
      kappa: 5.8,
      fragmentation: 0.28,
      rt: 0.87,
      bValue: 1.42,
      CTE: 0.21,
      SSI: 1.9,
      LFI: 0.8,
    },
    price: {
      priceChangePct60min: -4.2,
      priceChange1min: -1.1,
      priceChange5min: -2.8,
      acceleration: 0.3,
      isFlashCrash: false,
      lowestPricePct: -5.1,
      recoveryPct: 62.0,
    },
    volume: {
      buyVolumePct: 48.3,
      sellVolumePct: 51.7,
      volumeRatioVsBaseline: 1.2,
      orderBookDepthLevels: 18,
      spreadVsNormal: 0.9,
      totalTradesInWindow: 312,
      largestSingleOrderPct: 0.4,
    },
    structure: {
      whaleWalletIdentified: false,
      whaleWalletSizePct: null,
      whaleTransactionSizePct: null,
      cascadeFollowsSellCount: 0,
      botProbability: 12,
      jitoBundleCount: 0,
      sandwichCount: 0,
      sniperCount: 0,
      arbitrageCount: 1,
      tradeFrequencyVsBaseline: 1.1,
    },
    dataQuality: {
      totalTrades: 312,
      feedGapMinutes: 0.0,
      feedGapInCriticalWindow: false,
      metricsAvailable: 9,
      walletDataAvailable: true,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'NORMAL_VOLATILITY',
      designNotes: 'Alle Metriken grün, -4.2% in 60 Min, ausgeglichenes Buy/Sell, stabiler Spread, keine Anomalie.',
      expectedDifficulty: 'CLEAR',
      knownConfusionRisk: [],
      modelZone: 'IGNORE',
      modelCrashProbability: 0.04,
      modelDetectionReason: 'Alle Metriken im Normalbereich',
    },
  },

  // ─── EVT-P04: NORMAL_VOLATILITY (klar, leicht erhöhte Aktivität) ──────────
  {
    eventId: 'EVT-P04',
    windowStart: '2026-04-13T11:30:00Z',
    windowEnd:   '2026-04-13T12:30:00Z',
    metrics: {
      n: 0.51,
      PE: 0.62,
      kappa: 4.9,
      fragmentation: 0.34,
      rt: 0.94,
      bValue: 1.21,
      CTE: 0.29,
      SSI: 2.4,
      LFI: 1.1,
    },
    price: {
      priceChangePct60min: 6.8,       // Leichter Anstieg
      priceChange1min: 1.4,
      priceChange5min: 3.2,
      acceleration: 0.4,
      isFlashCrash: false,
      lowestPricePct: -2.1,
      recoveryPct: 100.0,
    },
    volume: {
      buyVolumePct: 58.4,
      sellVolumePct: 41.6,
      volumeRatioVsBaseline: 1.8,
      orderBookDepthLevels: 15,
      spreadVsNormal: 1.1,
      totalTradesInWindow: 487,
      largestSingleOrderPct: 0.7,
    },
    structure: {
      whaleWalletIdentified: false,
      whaleWalletSizePct: null,
      whaleTransactionSizePct: null,
      cascadeFollowsSellCount: 0,
      botProbability: 22,
      jitoBundleCount: 1,
      sandwichCount: 1,
      sniperCount: 2,
      arbitrageCount: 2,
      tradeFrequencyVsBaseline: 1.7,
    },
    dataQuality: {
      totalTrades: 487,
      feedGapMinutes: 0.0,
      feedGapInCriticalWindow: false,
      metricsAvailable: 9,
      walletDataAvailable: true,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'NORMAL_VOLATILITY',
      designNotes: '+6.8% in 60 Min, leicht Buy-dominiert. Keine kritische Metrik. Normales Marktgeschehen mit leichtem Uptrend.',
      expectedDifficulty: 'CLEAR',
      knownConfusionRisk: ['BOT_ACTIVITY_NO_PRICE_IMPACT'],
      modelZone: 'IGNORE',
      modelCrashProbability: 0.07,
      modelDetectionReason: 'Metriken im Normalbereich, leichte Kaufdominanz',
    },
  },

  // ─── EVT-P05: ILLIQUID_RANDOM_MOVE ────────────────────────────────────────
  {
    eventId: 'EVT-P05',
    windowStart: '2026-04-09T02:15:00Z',
    windowEnd:   '2026-04-09T03:15:00Z',
    metrics: {
      n: 0.61,
      PE: 0.44,         // Grenzwertig aber nicht kritisch
      kappa: 2.8,       // Leicht unter Schwelle
      fragmentation: 0.58,
      rt: 1.08,
      bValue: 0.98,     // Knapp unter 1.0
      CTE: 0.41,
      SSI: 3.1,
      LFI: 1.4,
    },
    price: {
      priceChangePct60min: -22.8,   // Hoch — aber durch Illiquidität erklärbar
      priceChange1min: -18.1,       // Ein einzelner Minutencandle
      priceChange5min: -22.4,
      acceleration: 1.2,
      isFlashCrash: true,           // Innerhalb 5 Min
      lowestPricePct: -24.1,
      recoveryPct: 71.0,            // Starke Erholung
    },
    volume: {
      buyVolumePct: 39.2,
      sellVolumePct: 60.8,          // Nicht extrem sell-dominiert
      volumeRatioVsBaseline: 2.1,   // Moderat erhöht
      orderBookDepthLevels: 2,      // SEHR DÜNN
      spreadVsNormal: 8.4,          // Enormer Spread
      totalTradesInWindow: 28,      // Nur 28 Trades
      largestSingleOrderPct: 41.3,  // Eine Order = 41% des Volumens
    },
    structure: {
      whaleWalletIdentified: false,
      whaleWalletSizePct: null,
      whaleTransactionSizePct: null,
      cascadeFollowsSellCount: 0,
      botProbability: 18,
      jitoBundleCount: 0,
      sandwichCount: 0,
      sniperCount: 0,
      arbitrageCount: 0,
      tradeFrequencyVsBaseline: 0.8, // UNTER Baseline!
    },
    dataQuality: {
      totalTrades: 28,
      feedGapMinutes: 0.0,
      feedGapInCriticalWindow: false,
      metricsAvailable: 7,          // 2 Metriken nicht berechenbar (SSI, LFI)
      walletDataAvailable: false,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'ILLIQUID_RANDOM_MOVE',
      designNotes: 'Nur 28 Trades, Order-Book 2 Levels, eine Order = 41% Vol, starke Erholung. Flash-Crash durch Illiquidität, kein koordinierter Sell-Druck.',
      expectedDifficulty: 'MODERATE',
      knownConfusionRisk: ['MASSIVE_DUMP', 'DATA_INSUFFICIENT'],
      modelZone: 'MONITOR',
      modelCrashProbability: 0.13,
      modelDetectionReason: 'Flash-Crash aber geringe Metrik-Bestätigung',
    },
  },

  // ─── EVT-P06: ILLIQUID_RANDOM_MOVE (weniger klar) ─────────────────────────
  {
    eventId: 'EVT-P06',
    windowStart: '2026-04-14T22:45:00Z',
    windowEnd:   '2026-04-14T23:45:00Z',
    metrics: {
      n: 0.73,
      PE: 0.38,         // Knapp unter 0.35-Schwelle — nicht ganz kritisch
      kappa: 2.4,
      fragmentation: 0.64,
      rt: 1.14,
      bValue: 0.88,
      CTE: 0.52,
      SSI: 4.2,
      LFI: 1.7,
    },
    price: {
      priceChangePct60min: -31.7,
      priceChange1min: -14.2,
      priceChange5min: -28.9,
      acceleration: 2.1,
      isFlashCrash: false,
      lowestPricePct: -34.1,
      recoveryPct: 48.0,        // 48% Erholung — grenzwertig
    },
    volume: {
      buyVolumePct: 22.1,
      sellVolumePct: 77.9,
      volumeRatioVsBaseline: 3.8,
      orderBookDepthLevels: 3,  // DÜNN
      spreadVsNormal: 5.7,
      totalTradesInWindow: 67,
      largestSingleOrderPct: 18.4,
    },
    structure: {
      whaleWalletIdentified: false,
      whaleWalletSizePct: null,
      whaleTransactionSizePct: null,
      cascadeFollowsSellCount: 1,
      botProbability: 24,
      jitoBundleCount: 0,
      sandwichCount: 1,
      sniperCount: 0,
      arbitrageCount: 1,
      tradeFrequencyVsBaseline: 2.2,
    },
    dataQuality: {
      totalTrades: 67,
      feedGapMinutes: 0.5,
      feedGapInCriticalWindow: false,
      metricsAvailable: 8,
      walletDataAvailable: false,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'ILLIQUID_RANDOM_MOVE',
      designNotes: 'Order-Book 3 Levels, größte Order 18% des Vol, -31.7% aber 77.9% Sell und 4/9 Metriken kritisch. Verwechslungsrisiko mit MASSIVE_DUMP hoch — Schlüssel: illiquider Markt schlägt Sell-Dominanz wenn Liquidität fehlt.',
      expectedDifficulty: 'MODERATE',
      knownConfusionRisk: ['MASSIVE_DUMP', 'UNCERTAIN'],
      modelZone: 'IMMEDIATE_SHORT',
      modelCrashProbability: 0.18,
      modelDetectionReason: 'PE + kappa + Sell-Dominanz triggern, aber Order-Book dünn',
    },
  },

  // ─── EVT-P07: WHALE_SELL_NO_CASCADE ───────────────────────────────────────
  {
    eventId: 'EVT-P07',
    windowStart: '2026-04-08T16:00:00Z',
    windowEnd:   '2026-04-08T17:00:00Z',
    metrics: {
      n: 0.67,
      PE: 0.48,
      kappa: 3.4,
      fragmentation: 0.41,
      rt: 1.04,
      bValue: 1.08,
      CTE: 0.38,
      SSI: 2.8,
      LFI: 1.6,
    },
    price: {
      priceChangePct60min: -14.8,
      priceChange1min: -9.1,     // Einer großen einzelnen Minute
      priceChange5min: -13.2,
      acceleration: 1.8,
      isFlashCrash: false,
      lowestPricePct: -15.4,
      recoveryPct: 67.0,         // Starke Erholung (67% des Drops)
    },
    volume: {
      buyVolumePct: 31.2,
      sellVolumePct: 68.8,
      volumeRatioVsBaseline: 4.2,
      orderBookDepthLevels: 12,  // Ausreichend liquide
      spreadVsNormal: 1.8,
      totalTradesInWindow: 284,
      largestSingleOrderPct: 38.7, // EINE Riesenorder
    },
    structure: {
      whaleWalletIdentified: true,
      whaleWalletSizePct: 2.3,
      whaleTransactionSizePct: 5.8,
      cascadeFollowsSellCount: 1, // Nur 1 Follow-Sell
      botProbability: 19,
      jitoBundleCount: 0,
      sandwichCount: 0,
      sniperCount: 1,
      arbitrageCount: 1,
      tradeFrequencyVsBaseline: 3.9,
    },
    dataQuality: {
      totalTrades: 284,
      feedGapMinutes: 0.0,
      feedGapInCriticalWindow: false,
      metricsAvailable: 9,
      walletDataAvailable: true,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'WHALE_SELL_NO_CASCADE',
      designNotes: 'Whale identifiziert (2.3% Supply, 5.8% Vol), eine große Order (38.7%), 67% Erholung in 30 Min, nur 1 Follow-Sell. Klar WHALE_SELL_NO_CASCADE.',
      expectedDifficulty: 'MODERATE',
      knownConfusionRisk: ['MASSIVE_DUMP'],
      modelZone: 'MONITOR',
      modelCrashProbability: 0.13,
      modelDetectionReason: 'Einzelne Großtransaktion, geringe Metrik-Bestätigung',
    },
  },

  // ─── EVT-P08: BOT_ACTIVITY_NO_PRICE_IMPACT ────────────────────────────────
  {
    eventId: 'EVT-P08',
    windowStart: '2026-04-15T07:00:00Z',
    windowEnd:   '2026-04-15T08:00:00Z',
    metrics: {
      n: 0.58,
      PE: 0.64,
      kappa: 5.1,
      fragmentation: 0.47,
      rt: 0.91,
      bValue: 1.18,
      CTE: 0.33,
      SSI: 2.2,
      LFI: 0.9,
    },
    price: {
      priceChangePct60min: -1.8,    // Minimal
      priceChange1min: -0.4,
      priceChange5min: -0.9,
      acceleration: 0.1,
      isFlashCrash: false,
      lowestPricePct: -2.3,
      recoveryPct: 91.0,
    },
    volume: {
      buyVolumePct: 49.1,
      sellVolumePct: 50.9,          // Fast ausgeglichen
      volumeRatioVsBaseline: 7.4,   // STARKER Volume-Spike
      orderBookDepthLevels: 16,
      spreadVsNormal: 1.0,
      totalTradesInWindow: 1847,    // SEHR viele Trades
      largestSingleOrderPct: 0.2,   // Viele kleine Orders
    },
    structure: {
      whaleWalletIdentified: false,
      whaleWalletSizePct: null,
      whaleTransactionSizePct: null,
      cascadeFollowsSellCount: 0,
      botProbability: 84,           // SEHR HOCH
      jitoBundleCount: 18,
      sandwichCount: 12,
      sniperCount: 3,
      arbitrageCount: 24,
      tradeFrequencyVsBaseline: 7.1,
    },
    dataQuality: {
      totalTrades: 1847,
      feedGapMinutes: 0.0,
      feedGapInCriticalWindow: false,
      metricsAvailable: 9,
      walletDataAvailable: true,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'BOT_ACTIVITY_NO_PRICE_IMPACT',
      designNotes: 'Bot-Prob 84%, 18 Jito-Bundles, 12 Sandwich-Txs, 24 Arbitrage — aber Preis nur -1.8%. Klassisches Bot-Wash ohne echten Preiseffekt.',
      expectedDifficulty: 'CLEAR',
      knownConfusionRisk: ['NORMAL_VOLATILITY'],
      modelZone: 'IGNORE',
      modelCrashProbability: 0.06,
      modelDetectionReason: 'Kein Preiseffekt trotz anomaler Trade-Frequenz',
    },
  },

  // ─── EVT-P09: GRENZFALL — MASSIVE_DUMP vs ILLIQUID ────────────────────────
  {
    eventId: 'EVT-P09',
    windowStart: '2026-04-11T04:30:00Z',
    windowEnd:   '2026-04-11T05:30:00Z',
    metrics: {
      n: 0.82,
      PE: 0.31,         // Knapp unter 0.35 — kritisch
      kappa: 2.1,       // Kritisch
      fragmentation: 0.74,
      rt: 1.31,
      bValue: 0.81,
      CTE: 0.63,
      SSI: 5.8,
      LFI: 2.2,
    },
    price: {
      priceChangePct60min: -24.3,   // Über 20%-Schwelle
      priceChange1min: -12.8,
      priceChange5min: -21.9,
      acceleration: 2.9,
      isFlashCrash: false,
      lowestPricePct: -27.1,
      recoveryPct: 31.0,            // Schwache Erholung
    },
    volume: {
      buyVolumePct: 18.4,
      sellVolumePct: 81.6,          // Sell-dominiert (> 70%)
      volumeRatioVsBaseline: 5.1,
      orderBookDepthLevels: 3,      // DÜNN — Illiquidity-Signal
      spreadVsNormal: 6.2,
      totalTradesInWindow: 84,      // Wenige Trades
      largestSingleOrderPct: 22.7,
    },
    structure: {
      whaleWalletIdentified: false,
      whaleWalletSizePct: null,
      whaleTransactionSizePct: null,
      cascadeFollowsSellCount: 2,
      botProbability: 27,
      jitoBundleCount: 0,
      sandwichCount: 1,
      sniperCount: 0,
      arbitrageCount: 1,
      tradeFrequencyVsBaseline: 4.1,
    },
    dataQuality: {
      totalTrades: 84,
      feedGapMinutes: 0.0,
      feedGapInCriticalWindow: false,
      metricsAvailable: 9,
      walletDataAvailable: false,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'ILLIQUID_RANDOM_MOVE',
      designNotes: 'Echter Grenzfall: 6/9 Metriken kritisch (für MASSIVE_DUMP), Sell-Anteil 81.6%, -24.3%. ABER Order-Book nur 3 Levels, nur 84 Trades, eine Order = 22.7% Vol. Entscheidend: ILLIQUID schlägt MASSIVE_DUMP wenn Liquidität fehlt (S4 im Baum). Schwache Erholung 31% spricht gegen WHALE.',
      expectedDifficulty: 'HARD',
      knownConfusionRisk: ['MASSIVE_DUMP', 'UNCERTAIN'],
      modelZone: 'IMMEDIATE_SHORT',
      modelCrashProbability: 0.22,
      modelDetectionReason: 'Multiple Metriken kritisch + hoher Sell-Druck',
    },
  },

  // ─── EVT-P10: GRENZFALL — WHALE_SELL mit Cascade-Risiko ──────────────────
  {
    eventId: 'EVT-P10',
    windowStart: '2026-04-16T13:00:00Z',
    windowEnd:   '2026-04-16T14:00:00Z',
    metrics: {
      n: 0.76,
      PE: 0.39,
      kappa: 2.6,
      fragmentation: 0.67,
      rt: 1.24,
      bValue: 0.91,
      CTE: 0.57,
      SSI: 4.9,         // Fast 5.0 — knapp unter Schwelle
      LFI: 1.8,
    },
    price: {
      priceChangePct60min: -18.2,   // Unter 20%-Schwelle — MASSIVE_DUMP nicht direkt
      priceChange1min: -7.4,
      priceChange5min: -15.8,
      acceleration: 2.3,
      isFlashCrash: false,
      lowestPricePct: -19.1,
      recoveryPct: 42.0,            // 42% — unter der 50%-Whale-Schwelle
    },
    volume: {
      buyVolumePct: 25.7,
      sellVolumePct: 74.3,
      volumeRatioVsBaseline: 6.8,
      orderBookDepthLevels: 10,     // Ausreichend liquide
      spreadVsNormal: 2.1,
      totalTradesInWindow: 631,
      largestSingleOrderPct: 12.8,
    },
    structure: {
      whaleWalletIdentified: true,
      whaleWalletSizePct: 1.4,
      whaleTransactionSizePct: 3.2,
      cascadeFollowsSellCount: 4,   // 4 Follow-Sells — Grenzbereich (3–5)
      botProbability: 41,           // Erhöht aber unter 50%
      jitoBundleCount: 2,
      sandwichCount: 3,
      sniperCount: 2,
      arbitrageCount: 4,
      tradeFrequencyVsBaseline: 5.9,
    },
    dataQuality: {
      totalTrades: 631,
      feedGapMinutes: 0.0,
      feedGapInCriticalWindow: false,
      metricsAvailable: 9,
      walletDataAvailable: true,
      orderBookDataAvailable: true,
    },
    _internal: {
      designedLabel: 'UNCERTAIN',
      designNotes: 'Echter Grenzfall: Whale identifiziert, aber 4 Follow-Sells (Grenzbereich 3–5), Erholung nur 42% (unter 50%-Schwelle für WHALE), -18.2% (unter 20% für MASSIVE_DUMP), 5/9 Metriken kritisch. Weder klar WHALE noch klar MASSIVE_DUMP. Korrekte Klasse: UNCERTAIN mit alternativeLabel WHALE_SELL_NO_CASCADE.',
      expectedDifficulty: 'HARD',
      knownConfusionRisk: ['WHALE_SELL_NO_CASCADE', 'MASSIVE_DUMP'],
      modelZone: 'MONITOR',
      modelCrashProbability: 0.14,
      modelDetectionReason: 'Whale-Signal + partielle Metrik-Bestätigung + Cascade-Unsicherheit',
    },
  },
];

// ─── Blind-Export (für Reviewer-Pakete) ─────────────────────────────────────

export function getBlindPilotCases() {
  return PILOT_CASES.map(({ _internal, ...blind }) => blind);
}

// ─── Summary für Pilot-Design-Dokumentation ──────────────────────────────────

export const PILOT_DESIGN_SUMMARY = {
  total: 10,
  distribution: {
    MASSIVE_DUMP: ['EVT-P01', 'EVT-P02'],
    NORMAL_VOLATILITY: ['EVT-P03', 'EVT-P04'],
    ILLIQUID_RANDOM_MOVE: ['EVT-P05', 'EVT-P06'],
    WHALE_SELL_NO_CASCADE: ['EVT-P07'],
    BOT_ACTIVITY_NO_PRICE_IMPACT: ['EVT-P08'],
    UNCERTAIN: ['EVT-P10'],
    GRENZFAELLE: ['EVT-P09', 'EVT-P10'],
  },
  difficulty: {
    CLEAR: ['EVT-P01', 'EVT-P02', 'EVT-P03', 'EVT-P04', 'EVT-P08'],
    MODERATE: ['EVT-P05', 'EVT-P06', 'EVT-P07'],
    HARD: ['EVT-P09', 'EVT-P10'],
  },
  criticalConfusionPairs: [
    'EVT-P09: MASSIVE_DUMP vs ILLIQUID_RANDOM_MOVE',
    'EVT-P10: WHALE_SELL_NO_CASCADE vs MASSIVE_DUMP vs UNCERTAIN',
    'EVT-P06: MASSIVE_DUMP vs ILLIQUID_RANDOM_MOVE (mäßig schwer)',
  ],
};
