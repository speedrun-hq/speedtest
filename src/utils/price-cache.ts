interface TokenPrice {
  [tokenId: string]: { usd: number };
}

class PriceCache {
  private cache: TokenPrice = {};
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

  async getTokenPrices(tokenIds: string[]): Promise<TokenPrice> {
    const now = Date.now();

    // Check if cache is still valid
    if (
      now - this.lastFetchTime < this.CACHE_DURATION &&
      Object.keys(this.cache).length > 0
    ) {
      return this.cache;
    }

    try {
      // Fetch prices for all tokens at once
      const uniqueTokenIds = [...new Set(tokenIds)];
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueTokenIds.join(",")}&vs_currencies=usd`
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(
            "CoinGecko API rate limit exceeded. Please try again later."
          );
        }
        throw new Error(
          `CoinGecko API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Validate the response structure
      if (typeof data !== "object" || data === null) {
        throw new Error("Invalid response format from CoinGecko API");
      }

      // Update cache
      this.cache = data;
      this.lastFetchTime = now;

      return this.cache;
    } catch (error) {
      console.error("Error fetching token prices:", error);
      // Return empty cache if fetch fails
      return {};
    }
  }

  getCachedPrice(tokenId: string): number | null {
    return this.cache[tokenId]?.usd || null;
  }

  clearCache(): void {
    this.cache = {};
    this.lastFetchTime = 0;
  }
}

// Token ID mapping for CoinGecko API
export const TOKEN_IDS: Record<string, string> = {
  ETH: "ethereum",
  AVAX: "avalanche-2",
  BNB: "binancecoin",
  POL: "matic-network",
  ZETA: "zetachain",
};

export const priceCache = new PriceCache();
