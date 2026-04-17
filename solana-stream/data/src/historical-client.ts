/**
 * Historical Data Client
 * 
 * Fetches historical Solana data for metric reconstruction:
 * - Transaction history for wallet graphs
 * - Price data for entropy calculations
 * - Account history for balance tracking
 * 
 * Uses Helius API for archival data access.
 */

export interface HeliusConfig {
  apiKey: string;
  endpoint?: string;
}

export interface TransactionRecord {
  signature: string;
  slot: number;
  timestamp: number;
  fee: number;
  success: boolean;
  accountKeys: string[];
  instructions: any[];
  computeUnits?: number;
}

export interface AccountHistoryRecord {
  pubkey: string;
  slot: number;
  timestamp: number;
  writeVersion: bigint;
  data: Buffer;
  owner: string;
}

export interface PriceRecord {
  slot: number;
  timestamp: number;
  token: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class HistoricalDataClient {
  private apiKey: string;
  private endpoint: string;

  constructor(config: HeliusConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint || 'https://api.helius.xyz/v0';
  }

  /**
   * Fetch transactions for an address within a slot range
   */
  async getTransactionsForAddress(
    address: string,
    startSlot: number,
    endSlot: number
  ): Promise<TransactionRecord[]> {
    const url = `${this.endpoint}/addresses/${address}/transactions`;
    
    const params = new URLSearchParams({
      'api-key': this.apiKey,
      'startSlot': startSlot.toString(),
      'endSlot': endSlot.toString(),
      'limit': '1000',
    });

    try {
      const response = await fetch(`${url}?${params}`);
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseTransactionResponse(data);
    } catch (error) {
      console.error(`[HistoricalData] Failed to fetch transactions for ${address}:`, error);
      return [];
    }
  }

  /**
   * Fetch account history (all writes to an account)
   */
  async getAccountHistory(
    pubkey: string,
    startSlot: number,
    endSlot: number
  ): Promise<AccountHistoryRecord[]> {
    const url = `${this.endpoint}/accounts/${pubkey}/history`;
    
    const params = new URLSearchParams({
      'api-key': this.apiKey,
      'startSlot': startSlot.toString(),
      'endSlot': endSlot.toString(),
      'limit': '1000',
    });

    try {
      const response = await fetch(`${url}?${params}`);
      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseAccountHistoryResponse(data, pubkey);
    } catch (error) {
      console.error(`[HistoricalData] Failed to fetch account history for ${pubkey}:`, error);
      return [];
    }
  }

  /**
   * Fetch parsed transactions (with metadata)
   */
  async getParsedTransactions(
    signatures: string[]
  ): Promise<TransactionRecord[]> {
    const url = `${this.endpoint}/transactions/batch`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({ signatures }),
    });

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`);
    }

    const data = await response.json();
    return this.parseTransactionResponse(data);
  }

  /**
   * Get enhanced transaction details with parsed instructions
   */
  async getEnhancedTransactions(
    signatures: string[]
  ): Promise<TransactionRecord[]> {
    const url = `${this.endpoint}/transactions`;
    
    const params = new URLSearchParams({
      'api-key': this.apiKey,
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.apiKey,
      },
      body: JSON.stringify({ transactions: signatures }),
    });

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`);
    }

    const data = await response.json();
    return this.parseEnhancedTransactionResponse(data);
  }

  private parseTransactionResponse(data: any): TransactionRecord[] {
    if (!Array.isArray(data)) return [];
    
    return data.map((tx: any) => ({
      signature: tx.signature || tx.transaction?.signatures?.[0] || '',
      slot: tx.slot || 0,
      timestamp: tx.timestamp || Date.now() / 1000,
      fee: tx.fee || 0,
      success: tx.meta?.err === null || tx.meta?.err === undefined,
      accountKeys: tx.transaction?.message?.accountKeys || [],
      instructions: tx.transaction?.message?.instructions || [],
      computeUnits: tx.meta?.computeUnits,
    }));
  }

  private parseAccountHistoryResponse(data: any, pubkey: string): AccountHistoryRecord[] {
    if (!Array.isArray(data)) return [];
    
    return data.map((record: any) => ({
      pubkey,
      slot: record.slot || 0,
      timestamp: record.timestamp || Date.now() / 1000,
      writeVersion: BigInt(record.writeVersion || 0),
      data: Buffer.from(record.data?.[0] || '', 'base64'),
      owner: record.owner || '',
    }));
  }

  private parseEnhancedTransactionResponse(data: any): TransactionRecord[] {
    if (!data?.transactions) return [];
    
    return data.transactions.map((tx: any) => ({
      signature: tx.signature || '',
      slot: tx.slot || 0,
      timestamp: tx.timestamp || Date.now() / 1000,
      fee: tx.fee || 0,
      success: tx.meta?.err === null || tx.meta?.err === undefined,
      accountKeys: tx.transaction?.message?.accountKeys || [],
      instructions: tx.transaction?.message?.instructions || [],
      computeUnits: tx.meta?.computeUnits,
    }));
  }

  /**
   * Estimate slot from timestamp (Solana ~400ms per slot average)
   */
  static timestampToSlot(timestamp: number, estimatedGenesisTimestamp: number = 1598896500000): number {
    const msPerSlot = 400;
    return Math.floor((timestamp * 1000 - estimatedGenesisTimestamp) / msPerSlot);
  }

  /**
   * Estimate timestamp from slot
   */
  static slotToTimestamp(slot: number, estimatedGenesisTimestamp: number = 1598896500000): number {
    const msPerSlot = 400;
    return Math.floor((slot * msPerSlot + estimatedGenesisTimestamp) / 1000);
  }
}

/**
 * Birdeye API client for OHLCV price data
 */
export interface BirdeyeConfig {
  apiKey: string;
}

export class BirdeyeClient {
  private apiKey: string;
  private endpoint = 'https://public-api.birdeye.so';

  constructor(config: BirdeyeConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Get OHLCV data for a token
   */
  async getOHLCV(
    token: string,
    address: string,
    timeframe: '1H' | '1D' | '1W',
    startTime: number,
    endTime: number
  ): Promise<PriceRecord[]> {
    const url = `${this.endpoint}/defi/ohlcv`;
    
    const params = new URLSearchParams({
      'api_key': this.apiKey,
      'address': address,
      'type': timeframe,
      'time_from': startTime.toString(),
      'time_to': endTime.toString(),
    });

    try {
      const response = await fetch(`${url}?${params}`);
      if (!response.ok) {
        throw new Error(`Birdeye API error: ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseOHLCVResponse(data, token);
    } catch (error) {
      console.error(`[Birdeye] Failed to fetch OHLCV for ${address}:`, error);
      return [];
    }
  }

  private parseOHLCVResponse(data: any, token: string): PriceRecord[] {
    if (!data?.data?.items || !Array.isArray(data.data.items)) return [];
    
    return data.data.items.map((item: any) => ({
      slot: 0, // Birdeye doesn't provide slot, use timestamp
      timestamp: item.unixTime,
      token,
      open: parseFloat(item.o) || 0,
      high: parseFloat(item.h) || 0,
      low: parseFloat(item.l) || 0,
      close: parseFloat(item.c) || 0,
      volume: parseFloat(item.v) || 0,
    }));
  }
}
