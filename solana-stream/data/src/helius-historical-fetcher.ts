/**
 * Helius Historical Data Fetcher
 * 
 * Fetches real Solana transaction history from Helius API for metric reconstruction.
 * This is the CRITICAL step for achieving PBO < 5%.
 */

export interface HeliusConfig {
  apiKey: string;
  endpoint?: string;
}

export interface TransactionData {
  signature: string;
  slot: number;
  timestamp: number;
  fee: number;
  success: boolean;
  accountKeys: string[];
  instructions: any[];
  computeUnits?: number;
}

export interface BlockData {
  slot: number;
  timestamp: number;
  blockhash: string;
  numTransactions: number;
}

/**
 * Fetch transactions for a specific time range
 */
export async function fetchTransactionsForTimeRange(
  config: HeliusConfig,
  startTime: number,
  endTime: number,
  accountFilter?: string[]
): Promise<TransactionData[]> {
  const endpoint = config.endpoint || 'https://api.helius.xyz/v0';
  
  // Helius Enhanced Transactions API
  const url = `${endpoint}/addresses/${accountFilter?.[0] || '11111111111111111111111111111111'}/transactions`;
  
  const params = new URLSearchParams({
    'api-key': config.apiKey,
    'startTime': startTime.toString(),
    'endTime': endTime.toString(),
    'limit': '1000',
  });

  try {
    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status} - ${await response.text()}`);
    }
    
    const data = await response.json();
    return parseTransactions(data);
  } catch (error) {
    console.error('[HeliusFetcher] Failed to fetch transactions:', error);
    return [];
  }
}

/**
 * Fetch transactions for multiple addresses (batched)
 */
export async function fetchBatchTransactions(
  config: HeliusConfig,
  addresses: string[],
  startTime: number,
  endTime: number
): Promise<Map<string, TransactionData[]>> {
  const results = new Map<string, TransactionData[]>();
  
  // Fetch in parallel (Helius supports batch)
  const promises = addresses.slice(0, 20).map(async (address) => {
    const txs = await fetchTransactionsForTimeRange(config, startTime, endTime, [address]);
    results.set(address, txs);
    return { address, txs };
  });

  await Promise.all(promises);
  return results;
}

/**
 * Fetch block metadata for time range
 */
export async function fetchBlocksForTimeRange(
  config: HeliusConfig,
  startTime: number,
  endTime: number
): Promise<BlockData[]> {
  const endpoint = config.endpoint || 'https://api.helius.xyz/v0';
  const url = `${endpoint}/blocks`;
  
  const params = new URLSearchParams({
    'api-key': config.apiKey,
    'startTime': startTime.toString(),
    'endTime': endTime.toString(),
    'limit': '1000',
  });

  try {
    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.map((block: any) => ({
      slot: block.slot,
      timestamp: block.blockTime * 1000,
      blockhash: block.blockhash,
      numTransactions: block.numTransactions || 0,
    }));
  } catch (error) {
    console.error('[HeliusFetcher] Failed to fetch blocks:', error);
    return [];
  }
}

/**
 * Fetch parsed transactions with full metadata
 */
export async function fetchParsedTransactions(
  config: HeliusConfig,
  signatures: string[]
): Promise<TransactionData[]> {
  const endpoint = config.endpoint || 'https://api.helius.xyz/v0';
  const url = `${endpoint}/transactions/batch`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({ transactions: signatures.slice(0, 100) }), // Batch limit
  });

  if (!response.ok) {
    throw new Error(`Helius API error: ${response.status}`);
  }

  const data = await response.json();
  return parseTransactions(data);
}

/**
 * Fetch account writes (history of account state changes)
 */
export async function fetchAccountHistory(
  config: HeliusConfig,
  pubkey: string,
  startTime: number,
  endTime: number
): Promise<any[]> {
  const endpoint = config.endpoint || 'https://api.helius.xyz/v0';
  const url = `${endpoint}/accounts/${pubkey}/history`;
  
  const params = new URLSearchParams({
    'api-key': config.apiKey,
    'startTime': startTime.toString(),
    'endTime': endTime.toString(),
    'limit': '1000',
  });

  try {
    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.map((record: any) => ({
      pubkey,
      slot: record.slot,
      timestamp: record.timestamp || record.blockTime * 1000,
      writeVersion: BigInt(record.writeVersion || 0),
      data: record.data?.[0] ? Buffer.from(record.data[0], 'base64') : Buffer.alloc(0),
      owner: record.owner || '',
    }));
  } catch (error) {
    console.error('[HeliusFetcher] Failed to fetch account history:', error);
    return [];
  }
}

/**
 * Parse Helius transaction response format
 */
function parseTransactions(data: any): TransactionData[] {
  if (!Array.isArray(data)) return [];
  
  return data.map((tx: any) => ({
    signature: tx.signature || tx.transaction?.signatures?.[0] || '',
    slot: tx.slot || 0,
    timestamp: tx.timestamp || tx.blockTime * 1000 || Date.now(),
    fee: tx.fee || 0,
    success: tx.meta?.err === null || tx.meta?.err === undefined,
    accountKeys: tx.transaction?.message?.accountKeys || [],
    instructions: tx.transaction?.message?.instructions || [],
    computeUnits: tx.meta?.computeUnits,
  }));
}

/**
 * Validation event time ranges for fetching
 */
export const VALIDATION_EVENTS_HISTORICAL = [
  {
    id: 'TRUMP-2025-01',
    name: 'TRUMP Memecoin Crash',
    startTime: Math.floor(new Date('2025-01-16T00:00:00Z').getTime() / 1000),
    endTime: Math.floor(new Date('2025-01-20T00:00:00Z').getTime() / 1000),
    // Key accounts to monitor
    accounts: [
      'CxqKXwB6z3t3fGXq6NveNze7P3eMwbvWvLNvVJP2dB3x', // Example TRUMP mint
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token program
    ],
  },
  {
    id: 'LIBRA-2025-02',
    name: 'LIBRA Token Scandal',
    startTime: Math.floor(new Date('2025-02-13T00:00:00Z').getTime() / 1000),
    endTime: Math.floor(new Date('2025-02-16T00:00:00Z').getTime() / 1000),
    accounts: [],
  },
  {
    id: 'SOL-2025-Q1',
    name: 'SOL 64% Correction',
    startTime: Math.floor(new Date('2024-12-15T00:00:00Z').getTime() / 1000),
    endTime: Math.floor(new Date('2025-04-20T00:00:00Z').getTime() / 1000),
    accounts: [
      '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963wkxs', // Serum
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
    ],
  },
  {
    id: 'OM-2025-04',
    name: 'Mantra OM Collapse',
    startTime: Math.floor(new Date('2025-04-09T00:00:00Z').getTime() / 1000),
    endTime: Math.floor(new Date('2025-04-14T00:00:00Z').getTime() / 1000),
    accounts: [],
  },
];

/**
 * Fetch and process validation event data
 */
export async function fetchValidationEventData(
  config: HeliusConfig,
  eventId: string
): Promise<TransactionData[]> {
  const event = VALIDATION_EVENTS_HISTORICAL.find(e => e.id === eventId);
  if (!event) {
    console.warn(`[HeliusFetcher] Event ${eventId} not found`);
    return [];
  }

  console.log(`[HeliusFetcher] Fetching data for ${event.name}...`);
  console.log(`[HeliusFetcher] Time range: ${new Date(event.startTime * 1000)} to ${new Date(event.endTime * 1000)}`);

  // Fetch from multiple sources
  const [transactions, blocks] = await Promise.all([
    fetchTransactionsForTimeRange(config, event.startTime, event.endTime, event.accounts),
    fetchBlocksForTimeRange(config, event.startTime, event.endTime),
  ]);

  console.log(`[HeliusFetcher] Fetched ${transactions.length} transactions, ${blocks.length} blocks`);

  return transactions;
}

/**
 * Estimate slot from timestamp (Solana ~400ms per slot)
 */
export function timestampToSlot(timestamp: number, genesisTimestamp = 1598896500000): number {
  return Math.floor((timestamp * 1000 - genesisTimestamp) / 400);
}

/**
 * Estimate timestamp from slot
 */
export function slotToTimestamp(slot: number, genesisTimestamp = 1598896500000): number {
  return Math.floor((slot * 400 + genesisTimestamp) / 1000);
}
