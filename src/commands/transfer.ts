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

    console.log("\nInitial Balances:");
    console.log(`Base ETH: ${baseNativeBalance}`);
    console.log(`Base USDC: ${baseUsdcBalance}`);
    console.log(`Arbitrum ETH: ${arbitrumNativeBalance}`);
    console.log(`Arbitrum USDC: ${arbitrumUsdcBalance}`);

    // Initiate transfer from Base to Arbitrum
    console.log("\nInitiating transfer from Base to Arbitrum...");

    const transferParams: InitiateTransferParams = {
      asset: baseConfig.usdc, // USDC on Base
      amount: ethers.parseUnits("10", 6), // 10 USDC (6 decimals)
      targetChain: arbitrumConfig.chainId, // Arbitrum chain ID
      receiver: wallet.address, // Send to same wallet address
      tip: ethers.parseUnits("0.1", 6), // 0.1 USDC tip
      salt: Math.floor(Math.random() * 1000), // Random salt
    };

    const intentId = await baseClient.initiateTransfer(transferParams);
    console.log(`Intent created with ID: ${intentId}`);

    // Poll the Speedrun API for intent status
    console.log("\nPolling for intent status...");
    const finalIntent = await speedrunApi.pollIntentStatus(
      intentId,
      ["fulfilled", "settled"],
      MAX_POLL_ATTEMPTS,
      POLL_INTERVAL_MS
    );

    if (!finalIntent) {
      console.error("Failed to retrieve intent data");
      process.exit(1);
    }

    console.log(`\nIntent final status: ${finalIntent.status}`);

    if (
      finalIntent.status === "fulfilled" ||
      finalIntent.status === "settled"
    ) {
      console.log("Success! The intent was processed successfully.");

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
