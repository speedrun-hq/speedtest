import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { Command } from "commander";
import { EvmClient, InitiateCallParams } from "../evm/client";
import {
  CHAINS,
  CURRENT_NETWORK,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
  INITIATOR_CONTRACTS,
} from "../constants";
import { handleIntentStatus, validateChains } from "./utils";

// Load environment variables
dotenv.config();

export async function executeCall() {
  // Setup command line parser
  const program = new Command();

  program
    .option("-s, --src <chain>", "Source chain", "arbitrum")
    .option("-d, --dst <chain>", "Destination chain", "base")
    .option("-a, --amount <amount>", "Amount to swap", "0.5")
    .option("-f, --fee <fee>", "Fee/tip amount", "0.2")
    .option("-g, --gas <limit>", "Gas limit", "600000")
    .parse(process.argv);

  const options = program.opts();

  // Get private key from environment
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    console.error("❌ Error: EVM_PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  try {
    // Initialize clients
    const chains = CHAINS[CURRENT_NETWORK];

    // Validate chains
    const { sourceConfig, destConfig } = validateChains(
      chains,
      options.src,
      options.dst
    );

    // Find initiator contract for this source -> destination chain
    const initiator = INITIATOR_CONTRACTS.find(
      (i) => i.sourceChain === options.src && i.destChain === options.dst
    );

    if (!initiator) {
      console.error(
        `❌ Error: No initiator contract found for ${options.src} -> ${options.dst}`
      );
      process.exit(1);
    }

    // Initialize clients
    const sourceClient = new EvmClient(sourceConfig, privateKey);
    const destClient = new EvmClient(destConfig, privateKey);

    // Initialize wallet address from private key
    const wallet = new ethers.Wallet(privateKey);
    console.log(`👛 Using wallet address: ${wallet.address}`);

    console.log(
      `\n🏃 Initiating call from ${sourceConfig.emoji} ${sourceConfig.name} to ${destConfig.emoji} ${destConfig.name}...`
    );
    console.log(`💰 Amount: ${options.amount} USDC, Fee: ${options.fee} USDC`);
    console.log(`🔧 Gas limit: ${options.gas}`);

    // Get current time for deadline
    const currentTime = Math.floor(Date.now() / 1000);
    const oneHour = 3600; // 1 hour in seconds

    // Setup path for Aerodrome swap
    const path = [
      destConfig.usdc,
      "0x4200000000000000000000000000000000000006", // WETH on Base
    ];

    // Setup stable flags
    const stableFlags = [false];

    // Parse amounts with the correct decimals (6 for USDC)
    const tokenDecimals = 6;

    const callParams: InitiateCallParams = {
      initiatorAddress: initiator.address,
      asset: sourceConfig.usdc, // USDC on source chain
      amount: ethers.parseUnits(options.amount, tokenDecimals),
      tip: ethers.parseUnits(options.fee, tokenDecimals),
      salt: 42, // Fixed salt as specified
      gasLimit: parseInt(options.gas),
      path: path,
      stableFlags: stableFlags,
      minAmountOut: 1n, // Lowest possible value (1 wei) for minimum output
      deadline: currentTime + oneHour,
      receiver: wallet.address,
    };

    const { intentId, txHash } = await sourceClient.initiateCall(callParams);

    // Handle intent status polling and result display
    await handleIntentStatus(
      intentId,
      txHash,
      destClient,
      destConfig,
      destConfig.usdc,
      "usdc",
      MAX_POLL_ATTEMPTS,
      POLL_INTERVAL_MS
    );
  } catch (error) {
    console.error("❌ Error running the test:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  executeCall().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}
