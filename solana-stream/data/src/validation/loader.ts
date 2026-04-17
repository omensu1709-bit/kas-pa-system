/**
 * Validation Events Dataset
 * 
 * Contains the 6 critical crash events for backtesting:
 * 
 * 1. TRUMP memecoin crash (Jan 17–19, 2025): ATH $73 → 85%+ decline
 * 2. LIBRA token scandal (Feb 14, 2025): $4.5B → 97% crash, insider cash-out
 * 3. SOL 64% correction (Jan–Apr 2025): $294 ATH → ~$105
 * 4. Mantra OM collapse (Apr 2025): $5.6B evaporated
 * 5. Memecoin market cap collapse (Dec 2024–Nov 2025): $150.6B → $38B
 * 6. WIF/BONK/POPCAT crashes (Q4 2024–Q1 2025): 80–91% from ATHs
 */

export interface ValidationEvent {
  id: string;
  name: string;
  token?: string;
  startDate: Date;
  endDate: Date;
  startSlot?: number;
  endSlot?: number;
  peakPrice?: number;
  crashPrice?: number;
  maxDrawdown: number;       // e.g., 0.85 = 85%
  marketCapStart?: number;
  marketCapEnd?: number;
  notes: string;
  
  // Expected signals for validation
  expectedHawkesSpike: boolean;
  expectedEntropyDrop: boolean;
  expectedFragmentationSpike: boolean;
  expectedSuperspreaderActivation: boolean;
}

/**
 * All validation events with ground truth
 */
export const VALIDATION_EVENTS: ValidationEvent[] = [
  {
    id: 'TRUMP-2025-01',
    name: 'TRUMP Memecoin Crash',
    token: 'TRUMP',
    startDate: new Date('2025-01-17'),
    endDate: new Date('2025-01-19'),
    peakPrice: 73,
    crashPrice: 8,
    maxDrawdown: 0.89,
    notes: 'TRUMP memecoin went from $73 ATH to $8 in 24 hours, ~85-90% crash',
    expectedHawkesSpike: true,
    expectedEntropyDrop: true,
    expectedFragmentationSpike: true,
    expectedSuperspreaderActivation: true,
  },
  {
    id: 'LIBRA-2025-02',
    name: 'LIBRA Token Scandal',
    token: 'LIBRA',
    startDate: new Date('2025-02-14'),
    endDate: new Date('2025-02-15'),
    peakPrice: 4.5,
    crashPrice: 0.10,
    maxDrawdown: 0.97,
    marketCapStart: 4.5e9,
    marketCapEnd: 0.15e9,
    notes: '$4.5B market cap to near zero in hours. Insider cash-out of $107M.',
    expectedHawkesSpike: true,
    expectedEntropyDrop: true,
    expectedFragmentationSpike: true,
    expectedSuperspreaderActivation: true,
  },
  {
    id: 'SOL-2025-Q1',
    name: 'SOL 64% Correction',
    token: 'SOL',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-04-15'),
    peakPrice: 294,
    crashPrice: 105,
    maxDrawdown: 0.64,
    notes: 'Macro-driven SOL correction from $294 ATH to ~$105',
    expectedHawkesSpike: false, // Macro event, less network-specific
    expectedEntropyDrop: true,
    expectedFragmentationSpike: false,
    expectedSuperspreaderActivation: true,
  },
  {
    id: 'OM-2025-04',
    name: 'Mantra OM Collapse',
    token: 'OM',
    startDate: new Date('2025-04-10'),
    endDate: new Date('2025-04-13'),
    peakPrice: 6.5,
    crashPrice: 0.5,
    maxDrawdown: 0.92,
    marketCapStart: 5.6e9,
    marketCapEnd: 0.4e9,
    notes: '$5.6B evaporated in hours, likely due to depeg/rug',
    expectedHawkesSpike: true,
    expectedEntropyDrop: true,
    expectedFragmentationSpike: true,
    expectedSuperspreaderActivation: true,
  },
  {
    id: 'MEMECAP-2024-2025',
    name: 'Memecoin Market Cap Collapse',
    startDate: new Date('2024-12-01'),
    endDate: new Date('2025-11-30'),
    maxDrawdown: 0.75,
    marketCapStart: 150.6e9,
    marketCapEnd: 38e9,
    notes: '$150.6B memecoin market cap collapsed to $38B. Broader memecoin winter.',
    expectedHawkesSpike: true,
    expectedEntropyDrop: true,
    expectedFragmentationSpike: false, // Gradual, not sudden
    expectedSuperspreaderActivation: true,
  },
  {
    id: 'WIF-BONK-POPCAT-2024',
    name: 'WIF/BONK/POPCAT Crashes',
    startDate: new Date('2024-10-01'),
    endDate: new Date('2025-03-31'),
    maxDrawdown: 0.85,
    notes: 'Major memecoins crashed 80-91% from their ATHs',
    expectedHawkesSpike: true,
    expectedEntropyDrop: true,
    expectedFragmentationSpike: true,
    expectedSuperspreaderActivation: true,
  },
];

/**
 * Convert validation events to training/test splits for CPCV
 */
export interface EventTimeRange {
  eventId: string;
  startTime: number;   // Unix timestamp
  endTime: number;
  startSlot: number;
  endSlot: number;
}

export function getEventTimeRanges(): EventTimeRange[] {
  return VALIDATION_EVENTS.map(event => ({
    eventId: event.id,
    startTime: event.startDate.getTime(),
    endTime: event.endDate.getTime(),
    startSlot: event.startSlot || 0,
    endSlot: event.endSlot || 0,
  }));
}

/**
 * Get events that overlap with a given time range
 */
export function getOverlappingEvents(startTime: number, endTime: number): ValidationEvent[] {
  return VALIDATION_EVENTS.filter(event => {
    return event.startDate.getTime() <= endTime && event.endDate.getTime() >= startTime;
  });
}

/**
 * For each event, compute the "danger window" - the period before the crash
 * when the metrics should start showing warning signs
 */
export function getDangerWindows(): Map<string, { start: Date; end: Date }> {
  const windows = new Map<string, { start: Date; end: Date }>();
  
  for (const event of VALIDATION_EVENTS) {
    // Danger window is 24h before the crash start
    const dangerStart = new Date(event.startDate.getTime() - 24 * 60 * 60 * 1000);
    windows.set(event.id, {
      start: dangerStart,
      end: event.startDate,
    });
  }
  
  return windows;
}
