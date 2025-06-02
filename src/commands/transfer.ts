import dotenv from "dotenv";
import { ethers } from "ethers";
import { EvmClient, InitiateTransferParams } from "../evm/client";
import { SpeedrunApiClient } from "../speedrun/api";
import {
  CHAINS,
  CURRENT_NETWORK,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
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

export async function executeTransfer() {
  // Get private key from environment
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: EVM_PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  try {
    // Initialize clients
    const baseConfig = CHAINS[CURRENT_NETWORK].base;
    const arbitrumConfig = CHAINS[CURRENT_NETWORK].arbitrum;

    const baseClient = new EvmClient(baseConfig, privateKey);
    const arbitrumClient = new EvmClient(arbitrumConfig, privateKey);
    const speedrunApi = new SpeedrunApiClient();

    // Initialize wallet address from private key
    const wallet = new ethers.Wallet(privateKey);
    console.log(`Using wallet address: ${wallet.address}`);

    // Check wallet balances
    const baseNativeBalance = await baseClient.getBalance();
    const baseUsdcBalance = await baseClient.getTokenBalance(baseConfig.usdc);
    const arbitrumNativeBalance = await arbitrumClient.getBalance();
    const arbitrumUsdcBalance = await arbitrumClient.getTokenBalance(
      arbitrumConfig.usdc
    );

    // Initiate transfer from Base to Arbitrum
    console.log("\nInitiating transfer from Base to Arbitrum...");

    const transferParams: InitiateTransferParams = {
      asset: baseConfig.usdc, // USDC on Base
      amount: ethers.parseUnits("0.3", 6), // 0.3 USDC (6 decimals)
      targetChain: arbitrumConfig.chainId, // Arbitrum chain ID
      receiver: wallet.address, // Send to same wallet address
      tip: ethers.parseUnits("0.2", 6), // 0.2 USDC tip
      salt: Math.floor(Math.random() * 1000), // Random salt
    };

    const { intentId, txHash } =
      await baseClient.initiateTransfer(transferParams);
    console.log(`Intent created with ID: ${intentId}`);
    console.log(`Intent initiated with transaction: ${txHash}`);

    // Poll the Speedrun API for intent status
    console.log("\nPolling for intent status...");
    const statusResult = await speedrunApi.pollIntentStatus(
      intentId,
      ["fulfilled", "settled"],
      MAX_POLL_ATTEMPTS,
      POLL_INTERVAL_MS
    );

    if (!statusResult.intent) {
      console.error("Intent was not found after maximum polling attempts.");
      process.exit(1);
    }

    const finalIntent = statusResult.intent;
    console.log(`\nFinal intent status: ${finalIntent.status}`);

    if (finalIntent.status === "fulfilled") {
      console.log(
        "Intent was fulfilled but not yet settled. The intent was processed successfully but settlement is still pending."
      );

      // Display timing information if available
      if (statusResult.timeToFulfill) {
        console.log(
          `Time to fulfill: ${formatDuration(statusResult.timeToFulfill)}`
        );
      }

      // Check final balances
      const finalArbitrumUsdcBalance = await arbitrumClient.getTokenBalance(
        arbitrumConfig.usdc
      );
      console.log(`\nFinal Arbitrum USDC balance: ${finalArbitrumUsdcBalance}`);

      if (finalIntent.fulfillment_tx) {
        console.log(`Fulfillment transaction: ${finalIntent.fulfillment_tx}`);
      }
    } else if (finalIntent.status === "settled") {
      console.log(
        "Success! The intent was processed and settled successfully."
      );

      // Display timing information if available
      if (statusResult.timeToFulfill) {
        console.log(
          `Time to fulfill: ${formatDuration(statusResult.timeToFulfill)}`
        );
      }

      if (statusResult.timeToSettle) {
        console.log(
          `Time from fulfill to settle: ${formatDuration(statusResult.timeToSettle)}`
        );
        if (statusResult.totalTime) {
          console.log(`Total time: ${formatDuration(statusResult.totalTime)}`);
        }
      }

      // Check final balances
      const finalArbitrumUsdcBalance = await arbitrumClient.getTokenBalance(
        arbitrumConfig.usdc
      );
      console.log(`\nFinal Arbitrum USDC balance: ${finalArbitrumUsdcBalance}`);

      if (finalIntent.fulfillment_tx) {
        console.log(`Fulfillment transaction: ${finalIntent.fulfillment_tx}`);
      }

      if (finalIntent.settlement_tx) {
        console.log(`Settlement transaction: ${finalIntent.settlement_tx}`);
      }
    } else {
      console.log(
        `The intent is still in ${finalIntent.status} state after maximum polling attempts.`
      );
    }
  } catch (error) {
    console.error("Error running the test:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  executeTransfer().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
