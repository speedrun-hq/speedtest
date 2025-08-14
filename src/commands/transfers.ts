import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { Command } from "commander";
import yaml from "js-yaml";
import fs from "fs";
import { EvmClient, InitiateTransferParams } from "../evm/client";
import {
  CHAINS,
  CURRENT_NETWORK,
  POLL_INTERVAL_MS,
  MAX_POLL_ATTEMPTS,
} from "../constants";
import { handleIntentStatus, validateChains, getTokenDecimals } from "./utils";
import { TransferLogger } from "../utils/logger";

// Load environment variables
dotenv.config();

// Type for supported assets
type SupportedAsset = "usdc" | "usdt";

interface TransferConfig {
  src: string;
  dst: string;
  asset: SupportedAsset;
  amount: string;
  fee: string;
}

interface TransferResult {
  index: number;
  sourceChain: string;
  destChain: string;
  asset: string;
  amount: string;
  status: "settled" | "fulfilled" | "pending" | "failed";
  message: string;
  fulfillmentTx?: string;
  settlementTx?: string;
  error?: string;
}

// Lock manager to handle concurrent transactions on the same chain
class LockManager {
  private locks: Map<string, { promise: Promise<void>; resolve: () => void }> =
    new Map();

  async acquireLock(chainId: string): Promise<void> {
    const lockKey = `lock_${chainId}`;

    // If there's no lock, create one
    if (!this.locks.has(lockKey)) {
      let resolveLock: () => void;
      const promise = new Promise<void>((resolve) => {
        resolveLock = resolve;
      });
      this.locks.set(lockKey, { promise, resolve: resolveLock! });
      return;
    }

    // If there is a lock, wait for it
    await this.locks.get(lockKey)?.promise;
  }

  async releaseLock(chainId: string): Promise<void> {
    const lockKey = `lock_${chainId}`;
    const lock = this.locks.get(lockKey);
    if (lock) {
      this.locks.delete(lockKey);
      lock.resolve();
    }
  }
}

async function executeSingleTransfer(
  config: TransferConfig,
  index: number,
  lockManager: LockManager
): Promise<TransferResult> {
  const logger = new TransferLogger(index);
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    logger.error("EVM_PRIVATE_KEY environment variable is required");
    throw new Error("EVM_PRIVATE_KEY environment variable is required");
  }

  try {
    const chains = CHAINS[CURRENT_NETWORK];
    const { sourceConfig, destConfig } = validateChains(
      chains,
      config.src,
      config.dst
    );

    // Validate asset is available on both chains
    if (!sourceConfig[config.asset]) {
      logger.error(
        `Asset '${config.asset}' not available on ${sourceConfig.name}`
      );
      throw new Error(
        `Asset '${config.asset}' not available on ${sourceConfig.name}`
      );
    }
    if (!destConfig[config.asset]) {
      logger.error(
        `Asset '${config.asset}' not available on ${destConfig.name}`
      );
      throw new Error(
        `Asset '${config.asset}' not available on ${destConfig.name}`
      );
    }

    const sourceClient = new EvmClient(sourceConfig, privateKey, logger);
    const destClient = new EvmClient(destConfig, privateKey, logger);

    // Initialize wallet address from private key
    const wallet = new ethers.Wallet(privateKey);
    logger.info(`Using wallet address: ${wallet.address}`);

    logger.info(
      `Initiating transfer of ${config.amount} ${config.asset.toUpperCase()} with ${config.fee} fee from ${sourceConfig.emoji} ${sourceConfig.name} to ${destConfig.emoji} ${destConfig.name}...`
    );

    const tokenDecimals = getTokenDecimals(sourceConfig.chainId, config.asset);

    const transferParams: InitiateTransferParams = {
      asset: sourceConfig[config.asset]!,
      amount: ethers.parseUnits(config.amount, tokenDecimals),
      targetChain: destConfig.chainId,
      receiver: wallet.address,
      tip: ethers.parseUnits(config.fee, tokenDecimals),
      salt: BigInt(Math.floor(Math.random() * 1000)),
    };

    // Acquire lock before initiating transfer
    await lockManager.acquireLock(sourceConfig.chainId.toString());
    let intentId: string;
    let txHash: string;
    try {
      const result = await sourceClient.initiateTransfer(transferParams);
      intentId = result.intentId;
      txHash = result.txHash;
    } finally {
      // Release lock after transfer is initiated
      await lockManager.releaseLock(sourceConfig.chainId.toString());
    }

    const statusResult = await handleIntentStatus(
      intentId,
      txHash,
      destClient,
      destConfig,
      destConfig[config.asset]!,
      config.asset,
      MAX_POLL_ATTEMPTS,
      POLL_INTERVAL_MS,
      logger
    );

    return {
      index,
      sourceChain: sourceConfig.name,
      destChain: destConfig.name,
      asset: config.asset.toUpperCase(),
      amount: config.amount,
      status: statusResult.status,
      message: statusResult.message,
      fulfillmentTx: statusResult.fulfillmentTx,
      settlementTx: statusResult.settlementTx,
    };
  } catch (error) {
    logger.error(`Error running transfer: ${error}`);
    return {
      index,
      sourceChain: config.src,
      destChain: config.dst,
      asset: config.asset.toUpperCase(),
      amount: config.amount,
      status: "failed",
      message: `Transfer failed: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function executeTransfers() {
  const program = new Command();

  program
    .requiredOption(
      "-f, --file <path>",
      "Path to YAML file containing transfer configurations"
    )
    .parse(process.argv);

  const options = program.opts();

  try {
    // Read and parse YAML file
    const fileContents = fs.readFileSync(options.file, "utf8");
    const transfers = yaml.load(fileContents) as TransferConfig[];

    if (!Array.isArray(transfers)) {
      console.error(
        "❌ Error: YAML file must contain an array of transfer configurations"
      );
      process.exit(1);
    }

    console.log(`🚀 Starting ${transfers.length} transfers...\n`);

    const lockManager = new LockManager();

    // Execute all transfers concurrently
    const results = await Promise.allSettled(
      transfers.map((config, index) =>
        executeSingleTransfer(config, index, lockManager)
      )
    );

    // Process results
    const transferResults: TransferResult[] = [];
    const failedTransfers: TransferResult[] = [];
    const successfulTransfers: TransferResult[] = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        const transferResult = result.value;
        transferResults.push(transferResult);
        if (transferResult.status === "settled") {
          successfulTransfers.push(transferResult);
        } else {
          // Consider fulfilled and other non-settled statuses as failed
          failedTransfers.push(transferResult);
        }
      } else if (result.status === "rejected") {
        // Handle rejected promises
        const errorResult: TransferResult = {
          index,
          sourceChain: transfers[index]?.src || "unknown",
          destChain: transfers[index]?.dst || "unknown",
          asset: transfers[index]?.asset.toUpperCase() || "UNKNOWN",
          amount: transfers[index]?.amount || "0",
          status: "failed",
          message: `Transfer failed: ${result.reason}`,
          error: result.reason,
        };
        transferResults.push(errorResult);
        failedTransfers.push(errorResult);
      }
    });

    // Sort results by index to maintain order
    transferResults.sort((a, b) => a.index - b.index);

    // Display summary table
    console.log("\n" + "=".repeat(120));
    console.log("TRANSFER SUMMARY");
    console.log("=".repeat(120));

    // Table header
    console.log(
      `${"#".padEnd(3)} ${"Source".padEnd(12)} ${"Dest".padEnd(12)} ${"Token".padEnd(6)} ${"Amount".padEnd(8)} ${"Status".padEnd(25)} ${"Details".padEnd(50)}`
    );
    console.log("-".repeat(120));

    // Table rows
    transferResults.forEach((result) => {
      const statusDisplay = getStatusDisplay(result.status);
      const details =
        result.message.length > 48
          ? result.message.substring(0, 45) + "..."
          : result.message;

      console.log(
        `${result.index.toString().padEnd(3)} ${result.sourceChain.padEnd(12)} ${result.destChain.padEnd(12)} ${result.asset.padEnd(6)} ${result.amount.padEnd(8)} ${statusDisplay.padEnd(25)} ${details.padEnd(50)}`
      );
    });

    // Summary statistics
    console.log("\n" + "-".repeat(120));
    console.log("SUMMARY STATISTICS");
    console.log("-".repeat(120));

    const settledCount = transferResults.filter(
      (r) => r.status === "settled"
    ).length;
    const fulfilledCount = transferResults.filter(
      (r) => r.status === "fulfilled"
    ).length;
    const failedCount = transferResults.filter(
      (r) => r.status === "failed"
    ).length;
    const pendingCount = transferResults.filter(
      (r) => r.status === "pending"
    ).length;

    console.log(`✅ Settled (Success):     ${settledCount}`);
    console.log(`⚠️  Fulfilled (Failed):    ${fulfilledCount}`);
    console.log(`❌ Failed:                ${failedCount}`);
    console.log(`⏳ Pending:               ${pendingCount}`);
    console.log(`📊 Total:                 ${transferResults.length}`);

    // Check if any transfers failed
    if (failedTransfers.length > 0) {
      console.log(
        `\n❌ ${failedTransfers.length} transfer(s) failed, ${successfulTransfers.length} transfer(s) succeeded.`
      );
      process.exit(1);
    }

    console.log(
      `\n✨ All ${transfers.length} transfers completed successfully!`
    );
  } catch (error) {
    console.error("❌ Error running transfers:", error);
    process.exit(1);
  }
}

function getStatusDisplay(status: TransferResult["status"]): string {
  switch (status) {
    case "settled":
      return "✅ Settled (Success)";
    case "fulfilled":
      return "⚠️  Fulfilled (Failed)";
    case "failed":
      return "❌ Failed";
    case "pending":
      return "⏳ Pending";
    default:
      return "❓ Unknown";
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  executeTransfers().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}
