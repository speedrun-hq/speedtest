# Speedtest

A tool to perform E2E tests on Speedrun exchange network.

## Features

- Initiate cross-chain token transfers on EVM chains
- Monitor intent status through the Speedrun API
- Verify token receipt on destination chain
- Monitor settlement status
- Check contract bytecodes across networks
- Verify contract implementation status

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with your EVM wallet private key and explorer API keys:

   ```
   # Your EVM wallet private key (required)
   EVM_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

   # Explorer API keys (required for bytecodes and verified commands)
   BASESCAN_API_KEY=your_basescan_api_key
   ARBISCAN_API_KEY=your_arbiscan_api_key
   BSCSCAN_API_KEY=your_bscscan_api_key
   POLYGONSCAN_API_KEY=your_polygonscan_api_key
   ETHERSCAN_API_KEY=your_etherscan_api_key
   ZETACHAIN_API_KEY=your_zetachain_api_key
   ```

   **Important**: Replace the example private key with your own. The wallet must have:

   - ETH on Base for gas
   - USDC on Base for transfers
   - ETH on Arbitrum for gas

## Usage

### Run the E2E test

```bash
npm run transfer
```

This will:

1. Check wallet balances on both chains
2. Initiate a USDC transfer from Base to Arbitrum
3. Poll the Speedrun API for intent status updates
4. Verify the funds are received on Arbitrum
5. Check the settlement status

### Check token balances

To check your USDC balances across all supported chains:

```bash
npm run balances
```

To check balances for a different address:

```bash
npm run balances -- --address 0x1234567890abcdef1234567890abcdef12345678
```

You can also use the short form:

```bash
npm run balances -- -a 0x1234567890abcdef1234567890abcdef12345678
```

This will display:

- Native token balances on each chain
- USDC balances on each chain
- Total USDC across all chains

### Compare contract bytecodes

To compare intent contract implementation bytecodes across networks:

```bash
npm run bytecodes
```

This requires explorer API keys set in your `.env` file and will:

- Fetch implementation addresses of the proxy contracts
- Retrieve and compare creation bytecodes across networks
- Group networks with matching bytecodes

### Check contract verification status

To check if intent contract implementations are verified on their respective explorers:

```bash
npm run verified
```

This requires explorer API keys set in your `.env` file and will:

- Fetch implementation addresses of the proxy contracts
- Check verification status on each explorer
- Show summary of verified and unverified contracts
