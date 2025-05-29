export enum Network {
  MAINNET = "mainnet",
  TESTNET = "testnet",
}

// Currently only supporting mainnet
export const CURRENT_NETWORK = Network.MAINNET;

export interface ChainConfig {
  name: string;
  chainId: number;
  rpc: string;
  intent: string;
  usdc: string;
}

export const CHAINS: Record<Network, Record<string, ChainConfig>> = {
  [Network.MAINNET]: {
    base: {
      name: "Base",
      chainId: 8453,
      rpc: "https://mainnet.base.org",
      intent: "0x999fce149FD078DCFaa2C681e060e00F528552f4",
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
    arbitrum: {
      name: "Arbitrum",
      chainId: 42161,
      rpc: "https://arb1.arbitrum.io/rpc",
      intent: "0xD6B0E2a8D115cCA2823c5F80F8416644F3970dD2",
      usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    },
  },
  [Network.TESTNET]: {
    // Can be filled when testnet support is needed
    base: {
      name: "Base Testnet",
      chainId: 84531,
      rpc: "https://sepolia.base.org",
      intent: "0x0000000000000000000000000000000000000000", // placeholder
      usdc: "0x0000000000000000000000000000000000000000", // placeholder
    },
    arbitrum: {
      name: "Arbitrum Testnet",
      chainId: 421613,
      rpc: "https://sepolia-rollup.arbitrum.io/rpc",
      intent: "0x0000000000000000000000000000000000000000", // placeholder
      usdc: "0x0000000000000000000000000000000000000000", // placeholder
    },
  },
};

export const SPEEDRUN_API_URL = "https://api.speedrun.exchange/api/v1";

export const POLL_INTERVAL_MS = 5000; // 5 seconds between API checks
export const MAX_POLL_ATTEMPTS = 60; // 5 minutes max waiting time (60 * 5s)
