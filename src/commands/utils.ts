import { ethers } from "ethers";
import { SpeedrunApiClient } from "../speedrun/api";
import { EvmClient } from "../evm/client";
import { ChainConfig } from "../constants";

/**
 * Format milliseconds to a readable duration string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds} sec`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Handle the common intent polling and result display logic
 */
export async function handleIntentStatus(
  intentId: string,
  txHash: string,
  destClient: EvmClient,
  destConfig: ChainConfig,
  assetAddress: string,
  assetName: string,
  maxAttempts: number,
  pollInterval: number
): Promise<void> {
  const speedrunApi = new SpeedrunApiClient();

  console.log(`📝 Intent created with ID: ${intentId}`);
  console.log(`🔄 Intent initiated with transaction: ${txHash}`);

  // Poll the Speedrun API for intent status
  console.log("\n⏳ Polling Speedrun API for intent status...");

  try {
    const statusResult = await speedrunApi.pollIntentStatus(
      intentId,
      ["fulfilled", "settled"],
      maxAttempts,
      pollInterval
    );

    if (!statusResult.intent) {
      console.error("❌ Intent was not found after maximum polling attempts.");
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
      const finalDestTokenBalance =
        await destClient.getTokenBalance(assetAddress);
      console.log(
        `\n💰 Final ${destConfig.emoji} ${destConfig.name} ${assetName.toUpperCase()} balance: ${finalDestTokenBalance}`
      );

      if (finalIntent.fulfillment_tx) {
        console.log(
          `🧾 Fulfillment transaction: ${finalIntent.fulfillment_tx}`
        );
      }
    } else if (finalIntent.status === "settled") {
      console.log("✅ The intent was settled successfully.");

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

      // Check final balances if there's a token to check
      if (assetAddress) {
        const finalDestTokenBalance =
          await destClient.getTokenBalance(assetAddress);
        console.log(
          `\n💰 Final ${destConfig.emoji} ${destConfig.name} ${assetName.toUpperCase()} balance: ${finalDestTokenBalance}`
        );
      }

      if (finalIntent.fulfillment_tx) {
        console.log(
          `🧾 Fulfillment transaction: ${finalIntent.fulfillment_tx}`
        );
      }

      if (finalIntent.settlement_tx) {
        console.log(`🧾 Settlement transaction: ${finalIntent.settlement_tx}`);
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
}

/**
 * Validate source and destination chains
 */
export function validateChains(
  chains: Record<string, ChainConfig>,
  sourceChain: string,
  destChain: string
): {
  sourceConfig: ChainConfig;
  destConfig: ChainConfig;
} {
  if (!chains[sourceChain]) {
    console.error(`❌ Error: Source chain '${sourceChain}' not supported`);
    console.log(`🔗 Supported chains: ${Object.keys(chains).join(", ")}`);
    process.exit(1);
  }
  if (!chains[destChain]) {
    console.error(`❌ Error: Destination chain '${destChain}' not supported`);
    console.log(`🔗 Supported chains: ${Object.keys(chains).join(", ")}`);
    process.exit(1);
  }

  return {
    sourceConfig: chains[sourceChain],
    destConfig: chains[destChain],
  };
}
