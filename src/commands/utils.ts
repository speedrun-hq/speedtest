import { ethers } from "ethers";
import { SpeedrunApiClient } from "../speedrun/api";
import { EvmClient } from "../evm/client";
import { ChainConfig } from "../constants";
import { TransferLogger } from "../utils/logger";

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
  pollInterval: number,
  logger: TransferLogger
): Promise<void> {
  const speedrunApi = new SpeedrunApiClient();

  logger.info(`Intent created with ID: ${intentId}`);
  logger.info(`Intent initiated with transaction: ${txHash}`);

  // Poll the Speedrun API for intent status
  logger.info("Polling Speedrun API for intent status...");

  try {
    const statusResult = await speedrunApi.pollIntentStatus(
      intentId,
      ["fulfilled", "settled"],
      maxAttempts,
      pollInterval,
      logger
    );

    if (!statusResult.intent) {
      logger.error("Intent was not found after maximum polling attempts.");
      return;
    }

    const finalIntent = statusResult.intent;
    logger.info(`Final intent status: ${finalIntent.status}`);

    if (finalIntent.status === "fulfilled") {
      logger.success(
        "Intent was fulfilled but not yet settled. The intent was processed successfully but settlement is still pending."
      );

      // Display timing information if available
      if (statusResult.timeToFulfill) {
        logger.info(
          `Time to fulfill: ${formatDuration(statusResult.timeToFulfill)}`
        );
      }

      // Check final balances
      const finalDestTokenBalance =
        await destClient.getTokenBalance(assetAddress);
      logger.info(
        `Final ${destConfig.emoji} ${destConfig.name} ${assetName.toUpperCase()} balance: ${finalDestTokenBalance}`
      );

      if (finalIntent.fulfillment_tx) {
        logger.info(`Fulfillment transaction: ${finalIntent.fulfillment_tx}`);
      }
    } else if (finalIntent.status === "settled") {
      logger.success("The intent was settled successfully.");

      // Display timing information if available
      if (statusResult.timeToFulfill) {
        logger.info(
          `Time to fulfill: ${formatDuration(statusResult.timeToFulfill)}`
        );
      }

      if (statusResult.timeToSettle) {
        logger.info(
          `Time from fulfill to settle: ${formatDuration(statusResult.timeToSettle)}`
        );
        if (statusResult.totalTime) {
          logger.info(`Total time: ${formatDuration(statusResult.totalTime)}`);
        }
      }

      // Check final balances if there's a token to check
      if (assetAddress) {
        const finalDestTokenBalance =
          await destClient.getTokenBalance(assetAddress);
        logger.info(
          `Final ${destConfig.emoji} ${destConfig.name} ${assetName.toUpperCase()} balance: ${finalDestTokenBalance}`
        );
      }

      if (finalIntent.fulfillment_tx) {
        logger.info(`Fulfillment transaction: ${finalIntent.fulfillment_tx}`);
      }

      if (finalIntent.settlement_tx) {
        logger.info(`Settlement transaction: ${finalIntent.settlement_tx}`);
      }
    } else {
      logger.warning(
        `The intent is still in ${finalIntent.status} state after maximum polling attempts.`
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Intent not found in API")
    ) {
      logger.error(error.message);
      logger.error(
        "The intent might not have been indexed yet or there could be an API issue."
      );
      return;
    }
    logger.error(`Error polling Speedrun API: ${error}`);
    return;
  }
}

/**
 * Get token decimals based on chain ID and token name
 * BSC (chainId 56) uses 18 decimals for both USDC and USDT
 * Other chains use 6 decimals for USDC and USDT
 */
export function getTokenDecimals(chainId: number, assetName: string): number {
  if (chainId === 56) {
    // BSC
    return 18; // Both USDC and USDT use 18 decimals on BSC
  }
  return 6; // Default to 6 decimals for other chains
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
