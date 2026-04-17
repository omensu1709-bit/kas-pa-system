import { PriceSource } from './multi-source-oracle.js';
/**
 * Helius Price Source
 * Nutzt Helius API für Preisdaten
 */
export declare class HeliusPriceSource implements PriceSource {
    name: string;
    private apiKey;
    private endpoint;
    constructor(apiKey: string);
    getPrice(tokenMint: string): Promise<{
        price: number;
        slot: number;
        timestamp: number;
    }>;
}
/**
 * Chainstack Price Source
 * Nutzt Chainstack API für Preisdaten
 */
export declare class ChainstackPriceSource implements PriceSource {
    name: string;
    private endpoint;
    private token;
    constructor(endpoint: string, token: string);
    getPrice(tokenMint: string): Promise<{
        price: number;
        slot: number;
        timestamp: number;
    }>;
}
/**
 * Jupiter Price Source
 * Nutzt Jupiter Aggregator für echte DEX-Preise
 */
export declare class JupiterPriceSource implements PriceSource {
    name: string;
    private baseUrl;
    getPrice(tokenMint: string): Promise<{
        price: number;
        slot: number;
        timestamp: number;
    }>;
}
/**
 * Mock Price Source für Testing
 */
export declare class MockPriceSource implements PriceSource {
    name: string;
    private basePrice;
    private volatility;
    constructor(basePrice?: number, volatility?: number);
    getPrice(tokenMint: string): Promise<{
        price: number;
        slot: number;
        timestamp: number;
    }>;
    setBasePrice(price: number): void;
}
/**
 *raydium Price Source
 * Holt Preis von Raydium Liquidity Pools
 */
export declare class RaydiumPriceSource implements PriceSource {
    name: string;
    private rpcEndpoint;
    constructor(rpcEndpoint?: string);
    getPrice(tokenMint: string): Promise<{
        price: number;
        slot: number;
        timestamp: number;
    }>;
}
//# sourceMappingURL=price-sources.d.ts.map