# Speedtest

A tool to perform E2E tests on Speedrun exchange network.

## Features

- Initiate cross-chain token transfers on EVM chains
- Monitor intent status through the Speedrun API
- Verify token receipt on destination chain
- Monitor settlement status

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file in the root directory with your EVM wallet private key:
   ```
   # Your EVM wallet private key (required)
   EVM_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   ```
   
   **Important**: Replace the example private key with your own. The wallet must have:
   - ETH on Base for gas
   - USDC on Base for transfers
   - ETH on Arbitrum for gas

## Usage

### Run the E2E test

```bash
npm start
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

This will display:
- Native token balances on each chain
- USDC balances on each chain
- Total USDC across all chains

## Example Output

### E2E Test

```
Using wallet address: 0x1234...5678

Initial Balances:
Base ETH: 0.5
Base USDC: 100.0
Arbitrum ETH: 0.1
Arbitrum USDC: 0.0

Initiating transfer from Base to Arbitrum...
Intent created with ID: 0x9876543210987654321098765432109876543210987654321098765432109876

Polling for intent status...
Intent 0x9876... status: pending (attempt 1/60)
Intent 0x9876... status: pending (attempt 2/60)
Intent 0x9876... status: fulfilled (attempt 3/60)

Intent final status: fulfilled
Success! The intent was processed successfully.

Final Arbitrum USDC balance: 10.0
Fulfillment transaction: 0xabcd...ef01
```
