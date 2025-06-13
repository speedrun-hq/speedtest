import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { Command } from "commander";
import { EvmClient, InitiateTransferParams } from "../evm/client";
import {
  CHAINS,
  CURRENT_NETWORK,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
} from "../constants";
import { handleIntentStatus, validateChains } from "./utils";

// Load environment variables
dotenv.config();

// Type for supported assets
type SupportedAsset = "usdc" | "usdt";

export async function executeTransfer() {
  // Setup command line parser
  const program = new Command();

  program
    .option("-s, --src <chain>", "Source chain", "base")
    .option("-d, --dst <chain>", "Destination chain", "arbitrum")
    .option("-a, --asset <token>", "Token to transfer", "usdc")
    .option("-m, --amount <amount>", "Amount to transfer", "0.3")
    .option("-f, --fee <fee>", "Fee/tip amount", "0.2")
    .parse(process.argv);

  const options = program.opts();
  const assetName = options.asset as SupportedAsset;

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

    // Validate asset is available on both chains
    if (!sourceConfig[assetName]) {
      console.error(
        `❌ Error: Asset '${assetName}' not available on ${sourceConfig.name}`
      );
      process.exit(1);
    }
    if (!destConfig[assetName]) {
      console.error(
        `❌ Error: Asset '${assetName}' not available on ${destConfig.name}`
      );
      process.exit(1);
    }

    const sourceClient = new EvmClient(sourceConfig, privateKey);
    const destClient = new EvmClient(destConfig, privateKey);

    // Initialize wallet address from private key
    const wallet = new ethers.Wallet(privateKey);
    console.log(`👛 Using wallet address: ${wallet.address}`);

    // Initiate transfer from source to destination
    console.log(
      `\n🏃 Initiating transfer of ${options.amount} ${assetName.toUpperCase()} with ${options.fee} fee from ${sourceConfig.emoji} ${sourceConfig.name} to ${destConfig.emoji} ${destConfig.name}...`
    );

    // Parse amounts with the correct number of decimals (6 for USDC)
    const tokenDecimals = assetName === "usdc" ? 6 : 18; // Default to 18 for other tokens

    const transferParams: InitiateTransferParams = {
      asset: sourceConfig[assetName], // Token address on source chain
      amount: ethers.parseUnits(options.amount, tokenDecimals), // Transfer amount
      targetChain: destConfig.chainId, // Destination chain ID
      receiver: wallet.address, // Send to same wallet address
      tip: ethers.parseUnits(options.fee, tokenDecimals), // Fee/tip amount
      salt: BigInt(Math.floor(Math.random() * 1000)), // Random salt
    };

    const { intentId, txHash } =
      await sourceClient.initiateTransfer(transferParams);

    // Handle intent status polling and result display
    await handleIntentStatus(
      intentId,
      txHash,
      destClient,
      destConfig,
      destConfig[assetName],
      assetName,
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
  executeTransfer().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}
