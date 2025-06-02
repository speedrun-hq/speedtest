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
  usdt?: string; // Optional as not all chains may have USDT
  emoji: string; // Emoji for the network
  explorer?: string; // Explorer API URL
}

export const CHAINS: Record<Network, Record<string, ChainConfig>> = {
  [Network.MAINNET]: {
    base: {
      name: "Base",
      chainId: 8453,
      rpc: "https://mainnet.base.org",
      intent: "0x999fce149FD078DCFaa2C681e060e00F528552f4",
      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      emoji: "🔵",
      explorer: "https://api.basescan.org",
    },
    arbitrum: {
      name: "Arbitrum",
      chainId: 42161,
      rpc: "https://arb1.arbitrum.io/rpc",
      intent: "0xD6B0E2a8D115cCA2823c5F80F8416644F3970dD2",
      usdc: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      usdt: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT on Arbitrum
      emoji: "🪐",
      explorer: "https://api.arbiscan.io",
    },
    avalanche: {
      name: "Avalanche",
      chainId: 43114,
      rpc: "https://avalanche-c-chain-rpc.publicnode.com",
      intent: "0x9a22A7d337aF1801BEEcDBE7f4f04BbD09F9E5bb",
      usdc: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      usdt: "0xde3a24028580884448a5397872046a019649b084",
      emoji: "🔺",
      explorer:
        "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan",
    },
    bsc: {
      name: "BSC",
      chainId: 56,
      rpc: "https://bsc-dataseed.bnbchain.org",
      intent: "0x68282fa70a32E52711d437b6c5984B714Eec3ED0",
      usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      usdt: "0x55d398326f99059fF775485246999027B3197955",
      emoji: "🟡",
      explorer: "https://api.bscscan.com",
    },
    ethereum: {
      name: "Ethereum",
      chainId: 1,
      rpc: "https://eth.llamarpc.com",
      intent: "0x951AB2A5417a51eB5810aC44BC1fC716995C1CAB",
      usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      emoji: "👽",
      explorer: "https://api.etherscan.io",
    },
    polygon: {
      name: "Polygon",
      chainId: 137,
      rpc: "https://polygon-rpc.com",
      intent: "0x4017717c550E4B6E61048D412a718D6A8078d264",
      usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      emoji: "🟣",
      explorer: "https://api.polygonscan.com",
    },
    zetachain: {
      name: "ZetaChain",
      chainId: 7000,
      rpc: "https://zetachain-evm.blockpi.network/v1/rpc/public",
      intent: "0x986e2db1aF08688dD3C9311016026daD15969e09",
      usdc: "0x0cbe0dF132a6c6B4a2974Fa1b7Fb953CF0Cc798a",
      usdt: "0x7c8dDa80bbBE1254a7aACf3219EBe1481c6E01d7",
      emoji: "🟩",
      explorer: "https://zetachain.blockscout.com/api",
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
      usdt: "0x0000000000000000000000000000000000000000", // placeholder
      emoji: "",
    },
    arbitrum: {
      name: "Arbitrum Testnet",
      chainId: 421613,
      rpc: "https://sepolia-rollup.arbitrum.io/rpc",
      intent: "0x0000000000000000000000000000000000000000", // placeholder
      usdc: "0x0000000000000000000000000000000000000000", // placeholder
      usdt: "0x0000000000000000000000000000000000000000", // placeholder
      emoji: "",
    },
  },
};

export const SPEEDRUN_API_URL = "https://api.speedrun.exchange/api/v1";

export const POLL_INTERVAL_MS = 5000; // 5 seconds between API checks
export const MAX_POLL_ATTEMPTS = 180; // 15 minutes max waiting time (180 * 5s)
