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
): Promise<void> {
  const logger = new TransferLogger(index);
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    logger.error("EVM_PRIVATE_KEY environment variable is required");
    return;
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
      return;
    }
    if (!destConfig[config.asset]) {
      logger.error(
        `Asset '${config.asset}' not available on ${destConfig.name}`
      );
      return;
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

    await handleIntentStatus(
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
  } catch (error) {
    logger.error(`Error running transfer: ${error}`);
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
    await Promise.all(
      transfers.map((config, index) =>
        executeSingleTransfer(config, index, lockManager)
      )
    );

    console.log("\n✨ All transfers completed!");
  } catch (error) {
    console.error("❌ Error running transfers:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  executeTransfers().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}
