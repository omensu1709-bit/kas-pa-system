import axios from 'axios';
/**
 * Helius Price Source
 * Nutzt Helius API für Preisdaten
 */
export class HeliusPriceSource {
    name = 'helius';
    apiKey;
    endpoint;
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.endpoint = 'https://api.helius.xyz/v0';
    }
    async getPrice(tokenMint) {
        try {
            // Hole Token-Metadaten inkl. Preis
            const response = await axios.get(`${this.endpoint}/tokens/${tokenMint}`, {
                headers: { 'x-api-key': this.apiKey },
                timeout: 5000
            });
            return {
                price: response.data.price || 0,
                slot: response.data.slot || 0,
                timestamp: Date.now()
            };
        }
        catch (error) {
            throw new Error(`Helius API Error: ${error.message}`);
        }
    }
}
/**
 * Chainstack Price Source
 * Nutzt Chainstack API für Preisdaten
 */
export class ChainstackPriceSource {
    name = 'chainstack';
    endpoint;
    token;
    constructor(endpoint, token) {
        this.endpoint = endpoint;
        this.token = token;
    }
    async getPrice(tokenMint) {
        try {
            // Rufe Token-Preis über Chainstack RPC ab
            const response = await axios.post(this.endpoint, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenSupply',
                params: [tokenMint]
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                timeout: 5000
            });
            // Chainstack hat keine direkte Preis-API
            // Wir nutzen dies als Fallback
            return {
                price: 0, // Wird von anderer Quelle geholt
                slot: 0,
                timestamp: Date.now()
            };
        }
        catch (error) {
            throw new Error(`Chainstack API Error: ${error.message}`);
        }
    }
}
/**
 * Jupiter Price Source
 * Nutzt Jupiter Aggregator für echte DEX-Preise
 */
export class JupiterPriceSource {
    name = 'jupiter';
    baseUrl = 'https://quote-api.jup.ag';
    async getPrice(tokenMint) {
        try {
            // Hole Preis von Jupiter (USD)
            const response = await axios.get(`${this.baseUrl}/v6/tokens/${tokenMint}/price`, { timeout: 5000 });
            return {
                price: response.data.price || 0,
                slot: 0, // Jupiter hat keine Slot-Info
                timestamp: Date.now()
            };
        }
        catch (error) {
            throw new Error(`Jupiter API Error: ${error.message}`);
        }
    }
}
/**
 * Mock Price Source für Testing
 */
export class MockPriceSource {
    name = 'mock';
    basePrice;
    volatility;
    constructor(basePrice = 1.0, volatility = 0.01) {
        this.basePrice = basePrice;
        this.volatility = volatility;
    }
    async getPrice(tokenMint) {
        // Simuliere zufälligen Preis mit Volatilität
        const randomFactor = 1 + (Math.random() - 0.5) * 2 * this.volatility;
        const price = this.basePrice * randomFactor;
        return {
            price,
            slot: Math.floor(Math.random() * 1000000),
            timestamp: Date.now()
        };
    }
    setBasePrice(price) {
        this.basePrice = price;
    }
}
/**
 *raydium Price Source
 * Holt Preis von Raydium Liquidity Pools
 */
export class RaydiumPriceSource {
    name = 'raydium';
    rpcEndpoint;
    constructor(rpcEndpoint = 'https://api.mainnet-beta.solana.com') {
        this.rpcEndpoint = rpcEndpoint;
    }
    async getPrice(tokenMint) {
        try {
            // Rufe Token-Konto über Solana RPC ab
            // In echter Implementation: Raydium Pool-Daten parsen
            const response = await axios.post(this.rpcEndpoint, {
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenSupply',
                params: [tokenMint]
            }, { timeout: 5000 });
            return {
                price: 0, // Muss aus Pool-Reserven berechnet werden
                slot: response.data.result?.context?.slot || 0,
                timestamp: Date.now()
            };
        }
        catch (error) {
            throw new Error(`Raydium Error: ${error.message}`);
        }
    }
}
//# sourceMappingURL=price-sources.js.map