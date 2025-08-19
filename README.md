<img src="logo.png" alt="Logo" style="display: block; margin: 0 auto; width: 200px;">

# Speedtest

A tool to perform E2E tests on Speedrun exchange network, including cross-chain transfers and calls.

## Features

- Initiate cross-chain token transfers on EVM chains
- Execute cross-chain calls through initiator contracts
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

## Usage

### Run a Cross-Chain Transfer

```bash
npm run transfer
```

By default, this will transfer 0.3 USDC from Base to Arbitrum with a 0.2 USDC fee.

You can customize the transfer with the following options:

```bash
npm run transfer -- --src base --dst arbitrum --asset usdc --amount 0.3 --fee 0.2
```

Options:

- `--src`, `-s`: Source chain (default: "base")
- `--dst`, `-d`: Destination chain (default: "arbitrum")
- `--asset`, `-a`: Token to transfer (default: "usdc")
- `--amount`, `-m`: Amount to transfer (default: "0.3")
- `--fee`, `-f`: Fee/tip amount (default: "0.2")

### Run a Cross-Chain Call

```bash
npm run call
```

By default, this will initiate a cross-chain call from Arbitrum to Base through an initiator contract, swapping 0.5 USDC with a 0.2 USDC fee.

The initiator contract acts as a mediator that executes specialized operations on the destination chain. Unlike direct transfers, cross-chain calls allow for more complex interactions like swaps or other DeFi operations. In this implementation, the call initiates an Aerodrome swap on the destination chain.

You can customize the call with the following options:

```bash
npm run call -- --src arbitrum --dst base --amount 0.5 --fee 0.2 --gas 600000
```

Options:

- `--src`, `-s`: Source chain (default: "arbitrum")
- `--dst`, `-d`: Destination chain (default: "base")
- `--amount`, `-a`: Amount to swap (default: "0.5")
- `--fee`, `-f`: Fee/tip amount (default: "0.2")
- `--gas`, `-g`: Gas limit (default: "600000")

### Check token balances

To check your USDC balances across all supported chains:

```bash
npm run balances
```

To check balances for a different address:

```bash
npm run balances -- --address 0x1234567890abcdef1234567890abcdef12345678
```

### Compare contract bytecodes

To compare intent contract implementation bytecodes across networks:

```bash
npm run bytecodes
```

This requires explorer API keys set in your `.env` file.

### Check contract verification status

To check if intent contract implementations are verified on their respective explorers:

```bash
npm run verified
```

This requires explorer API keys set in your `.env`.

### Check gas limits

To check gas limits for cross-chain operations on different chains:

```bash
npm run gas-limits
```

This command queries the ZetaChain router contract to display:

- Gas limits for each supported chain
- Current gas prices (when available)
- Estimated fees for cross-chain operations in both native tokens and USD
- Token prices are fetched from CoinGecko API with caching to avoid rate limits

The USD fee calculation helps you understand the real cost of cross-chain operations across different networks.

### View token associations

To view all token associations for USDC and USDT across different chains:

```bash
npm run token-associations
```

This command queries the ZetaChain router contract to display:

- Chain IDs and names for each token
- Associated asset addresses on each chain
- ZRC20 token addresses on ZetaChain

The output shows a nicely formatted table with emojis and chain information for easy reading.

### View SwapAlgebra intermediary tokens

To view the intermediary tokens used by SwapAlgebra for USDC and USDT swaps:

```bash
npm run swap-algebra-intermediaries
```

This command queries the ZetaChain SwapAlgebra contract to display:

- Intermediary token addresses for USDC and USDT
- These tokens act as bridge tokens in the swap process on ZetaChain

### View SwapAlgebra pool liquidity

To view the liquidity reserves in SwapAlgebra pools for USDC and USDT:

```bash
npm run swap-algebra-liquidity
```

This command queries the ZetaChain SwapAlgebra pools to display:

- Pool addresses for token pairs
- Token reserves with formatted amounts
- USD values for each reserve
- Total liquidity in USD

The pools represent the liquidity available for swaps between ZRC20 tokens and their intermediary tokens.

### Execute a serie of transfer

Execute multiple cross-chain transfers concurrently using a YAML configuration file:

```bash
npm run transfers -- -f <path_to_yaml>
```

A sample test config file is provided in `transfers.yml`

Example:

```bash
npm run transfers -- -f transfers.yml
```
