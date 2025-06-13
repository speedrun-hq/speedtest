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
import { handleIntentStatus, validateChains } from "./utils";
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

// Nonce manager to handle concurrent transactions on the same chain
class NonceManager {
  private nonces: Map<string, number> = new Map();
  private locks: Map<string, Promise<void>> = new Map();

  async acquireLock(chainId: string): Promise<void> {
    const lockKey = `lock_${chainId}`;
    // If there's no lock, create one
    if (!this.locks.has(lockKey)) {
      let resolveLock: (value: void) => void;
      const lock = new Promise<void>((resolve) => {
        resolveLock = resolve;
      });
      this.locks.set(lockKey, lock);
      return;
    }

    // If there is a lock, wait for it
    await this.locks.get(lockKey);
  }

  async releaseLock(chainId: string): Promise<void> {
    const lockKey = `lock_${chainId}`;
    const lock = this.locks.get(lockKey);
    if (lock) {
      this.locks.delete(lockKey);
      // Resolve the lock promise
      (lock as any).resolve?.();
    }
  }

  async getNextNonce(chainId: string, client: EvmClient): Promise<number> {
    await this.acquireLock(chainId);
    try {
      // Always get the latest nonce from the network
      const currentNonce = await client.getTransactionCount();

      // If we have a stored nonce for this chain, use the higher of the two
      const storedNonce = this.nonces.get(chainId) ?? 0;
      const nonce = Math.max(currentNonce, storedNonce);

      // Store the next nonce for this chain
      this.nonces.set(chainId, nonce + 1);

      return nonce;
    } finally {
      await this.releaseLock(chainId);
    }
  }
}

async function executeSingleTransfer(
  config: TransferConfig,
  index: number,
  nonceManager: NonceManager
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

    // Get next nonce for the source chain
    const nonce = await nonceManager.getNextNonce(
      sourceConfig.chainId.toString(),
      sourceClient
    );

    logger.info(
      `Initiating transfer of ${config.amount} ${config.asset.toUpperCase()} with ${config.fee} fee from ${sourceConfig.emoji} ${sourceConfig.name} to ${destConfig.emoji} ${destConfig.name}...`
    );

    const tokenDecimals = config.asset === "usdc" ? 6 : 18;

    const transferParams: InitiateTransferParams = {
      asset: sourceConfig[config.asset]!,
      amount: ethers.parseUnits(config.amount, tokenDecimals),
      targetChain: destConfig.chainId,
      receiver: wallet.address,
      tip: ethers.parseUnits(config.fee, tokenDecimals),
      salt: BigInt(Math.floor(Math.random() * 1000)),
    };

    const { intentId, txHash } = await sourceClient.initiateTransfer(
      transferParams,
      nonce
    );

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

    const nonceManager = new NonceManager();

    // Execute all transfers concurrently
    await Promise.all(
      transfers.map((config, index) =>
        executeSingleTransfer(config, index, nonceManager)
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
