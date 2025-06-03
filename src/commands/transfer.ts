import dotenv from "dotenv";
import { ethers } from "ethers";
import { Command } from "commander";
import { EvmClient, InitiateTransferParams } from "../evm/client";
import { SpeedrunApiClient } from "../speedrun/api";
import {
  CHAINS,
  CURRENT_NETWORK,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
  ChainConfig,
} from "../constants";

// Load environment variables
dotenv.config();

// Helper to format time duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds} sec`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

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

    // Validate chain options
    if (!chains[options.src]) {
      console.error(`❌ Error: Source chain '${options.src}' not supported`);
      console.log(`🔗 Supported chains: ${Object.keys(chains).join(", ")}`);
      process.exit(1);
    }
    if (!chains[options.dst]) {
      console.error(
        `❌ Error: Destination chain '${options.dst}' not supported`
      );
      console.log(`🔗 Supported chains: ${Object.keys(chains).join(", ")}`);
      process.exit(1);
    }

    const sourceConfig = chains[options.src];
    const destConfig = chains[options.dst];

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
    const speedrunApi = new SpeedrunApiClient();

    // Initialize wallet address from private key
    const wallet = new ethers.Wallet(privateKey);
    console.log(`👛 Using wallet address: ${wallet.address}`);

    // Check wallet balances
    const sourceNativeBalance = await sourceClient.getBalance();
    const sourceTokenBalance = await sourceClient.getTokenBalance(
      sourceConfig[assetName]
    );
    const destNativeBalance = await destClient.getBalance();
    const destTokenBalance = await destClient.getTokenBalance(
      destConfig[assetName]
    );

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
      salt: Math.floor(Math.random() * 1000), // Random salt
    };

    const { intentId, txHash } =
      await sourceClient.initiateTransfer(transferParams);
    console.log(`📝 Intent created with ID: ${intentId}`);
    console.log(`🔄 Intent initiated with transaction: ${txHash}`);

    // Poll the Speedrun API for intent status
    console.log("\n⏳ Polling Speedrun API for intent status...");

    try {
      const statusResult = await speedrunApi.pollIntentStatus(
        intentId,
        ["fulfilled", "settled"],
        MAX_POLL_ATTEMPTS,
        POLL_INTERVAL_MS
      );

      if (!statusResult.intent) {
        console.error(
          "❌ Intent was not found after maximum polling attempts."
        );
        process.exit(1);
      }

      const finalIntent = statusResult.intent;
      console.log(`\n📊 Final intent status: ${finalIntent.status}`);

      if (finalIntent.status === "fulfilled") {
        console.log(
          "👌 Intent was fulfilled but not yet settled. The intent was processed successfully but settlement is still pending."
        );

        // Display timing information if available
        if (statusResult.timeToFulfill) {
          console.log(
            `⏱️ Time to fulfill: ${formatDuration(statusResult.timeToFulfill)}`
          );
        }

        // Check final balances
        const finalDestTokenBalance = await destClient.getTokenBalance(
          destConfig[assetName]
        );
        console.log(
          `\n💰 Final ${destConfig.emoji} ${destConfig.name} ${assetName.toUpperCase()} balance: ${finalDestTokenBalance}`
        );

        if (finalIntent.fulfillment_tx) {
          console.log(
            `🧾 Fulfillment transaction: ${finalIntent.fulfillment_tx}`
          );
        }
      } else if (finalIntent.status === "settled") {
        console.log(
          "✅ Success! The intent was fulfilled and settled successfully."
        );

        // Display timing information if available
        if (statusResult.timeToFulfill) {
          console.log(
            `⏱️ Time to fulfill: ${formatDuration(statusResult.timeToFulfill)}`
          );
        }

        if (statusResult.timeToSettle) {
          console.log(
            `⏱️ Time from fulfill to settle: ${formatDuration(statusResult.timeToSettle)}`
          );
          if (statusResult.totalTime) {
            console.log(
              `⏱️ Total time: ${formatDuration(statusResult.totalTime)}`
            );
          }
        }

        // Check final balances
        const finalDestTokenBalance = await destClient.getTokenBalance(
          destConfig[assetName]
        );
        console.log(
          `\n💰 Final ${destConfig.emoji} ${destConfig.name} ${assetName.toUpperCase()} balance: ${finalDestTokenBalance}`
        );

        if (finalIntent.fulfillment_tx) {
          console.log(
            `🧾 Fulfillment transaction: ${finalIntent.fulfillment_tx}`
          );
        }

        if (finalIntent.settlement_tx) {
          console.log(
            `🧾 Settlement transaction: ${finalIntent.settlement_tx}`
          );
        }
      } else {
        console.log(
          `⚠️ The intent is still in ${finalIntent.status} state after maximum polling attempts.`
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Intent not found in API")
      ) {
        console.error(`❌ ${error.message}`);
        console.error(
          "❌ The intent might not have been indexed yet or there could be an API issue."
        );
        process.exit(1);
      }
      console.error("❌ Error polling Speedrun API:", error);
      process.exit(1);
    }
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
