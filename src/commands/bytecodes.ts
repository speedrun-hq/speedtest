import dotenv from "dotenv";
import { ethers } from "ethers";
import { EvmClient } from "../evm/client";
import { CHAINS, CURRENT_NETWORK } from "../constants";
import crypto from "crypto";
import { fetchCreationBytecode } from "../explorer/bytecode";

// Load environment variables
dotenv.config();

// Map chain names to environment variable names for API keys
const API_KEY_ENV_VARS: Record<string, string> = {
  base: "BASESCAN_API_KEY",
  arbitrum: "ARBISCAN_API_KEY",
  bsc: "BSCSCAN_API_KEY",
  polygon: "POLYGONSCAN_API_KEY",
  ethereum: "ETHERSCAN_API_KEY",
  zetachain: "ZETACHAIN_API_KEY",
};

// Storage slot for EIP-1967 implementation address
// keccak256("eip1967.proxy.implementation") - 1
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function getImplementationAddress(
  provider: ethers.JsonRpcProvider,
  proxyAddress: string
): Promise<string> {
  // Get the implementation address from the storage slot
  const storageData = await provider.getStorage(
    proxyAddress,
    IMPLEMENTATION_SLOT
  );

  // Convert the storage data to an address
  // Remove padding (32 bytes storage value -> 20 bytes address)
  return ethers.getAddress("0x" + storageData.slice(26));
}

async function getBytecodeHash(
  chainName: string,
  provider: ethers.JsonRpcProvider,
  address: string,
  explorerUrl?: string
): Promise<{ bytecodeHash: string | null; isCreationBytecode: boolean }> {
  let bytecode = null;
  let isCreationBytecode = false;

  // Try to get creation bytecode from explorer if available
  if (explorerUrl) {
    console.log(
      `    Attempting to fetch creation bytecode from ${chainName} explorer...`
    );

    const creationBytecode = await fetchCreationBytecode(
      chainName,
      explorerUrl,
      address
    );

    if (creationBytecode) {
      console.log(`    ✅ Successfully retrieved creation bytecode`);
      bytecode = creationBytecode;
      isCreationBytecode = true;
    } else {
      console.log(`    ❌ Failed to get creation bytecode for ${chainName}`);
    }
  } else {
    console.log(`    ⚠️ No explorer URL configured for ${chainName}`);
  }

  // Only calculate hash if we got the creation bytecode
  if (bytecode) {
    return {
      bytecodeHash: crypto.createHash("sha256").update(bytecode).digest("hex"),
      isCreationBytecode,
    };
  }

  // Return null if we couldn't get creation bytecode
  return {
    bytecodeHash: null,
    isCreationBytecode: false,
  };
}

export async function showBytecodes() {
  try {
    console.log(
      "\nComparing intent contract implementation creation bytecodes:"
    );
    console.log("-".repeat(80));

    // Get chain configs for the current network
    const chainConfigs = CHAINS[CURRENT_NETWORK];

    // Store results for comparison
    const results: {
      chainName: string;
      chainEmoji: string;
      implAddress: string;
      bytecodeHash: string | null;
      isCreationBytecode: boolean;
    }[] = [];

    // Find the longest network name for alignment
    const longestNameLength = Math.max(
      ...Object.entries(chainConfigs).map(
        ([_, config]) => (config.emoji + " " + config.name).length
      )
    );

    // Fetch implementation addresses and bytecode hashes
    for (const [chainName, chainConfig] of Object.entries(chainConfigs)) {
      try {
        // Skip ZetaChain as requested
        if (chainName === "zetachain") {
          console.log(`Skipping ZetaChain as requested.`);
          continue;
        }

        // Create provider for this chain
        const provider = new ethers.JsonRpcProvider(chainConfig.rpc);

        // Get implementation address from proxy
        console.log(
          `Fetching implementation for ${chainConfig.emoji} ${chainConfig.name}...`
        );

        let implAddress;

        try {
          implAddress = await getImplementationAddress(
            provider,
            chainConfig.intent
          );
        } catch (error) {
          console.error(
            `    ❌ Error getting implementation address: ${error}`
          );
          continue;
        }

        // Get bytecode hash of implementation
        const { bytecodeHash, isCreationBytecode } = await getBytecodeHash(
          chainName,
          provider,
          implAddress,
          chainConfig.explorer
        );

        // Store result
        results.push({
          chainName,
          chainEmoji: chainConfig.emoji,
          implAddress,
          bytecodeHash,
          isCreationBytecode,
        });
      } catch (error) {
        console.error(`Error fetching data for ${chainName}:`, error);
      }
    }

    // Display implementation addresses
    console.log("\nImplementation Addresses:");
    console.log("-".repeat(80));
    for (const result of results) {
      const label = `${result.chainEmoji} ${chainConfigs[result.chainName].name}`;
      console.log(
        `  ${label.padEnd(longestNameLength)}: ${result.implAddress}`
      );
    }

    // Filter out results where we couldn't get creation bytecode
    const creationCodeResults = results.filter((r) => r.bytecodeHash !== null);

    if (creationCodeResults.length === 0) {
      console.log("\n❌ Could not retrieve creation bytecode for any chain");
      return;
    }

    // Group and display bytecode hashes
    console.log("\nCreation Bytecode Hashes:");
    console.log("-".repeat(80));

    // Group by bytecode hash
    const hashGroups: Record<string, string[]> = {};
    for (const result of creationCodeResults) {
      if (result.bytecodeHash) {
        if (!hashGroups[result.bytecodeHash]) {
          hashGroups[result.bytecodeHash] = [];
        }
        hashGroups[result.bytecodeHash].push(result.chainName);
      }
    }

    // Display grouped by hash
    let groupNumber = 1;
    for (const [hash, chains] of Object.entries(hashGroups)) {
      console.log(`Group ${groupNumber}:`);
      for (const chainName of chains) {
        const chain = chainConfigs[chainName];
        const label = `${chain.emoji} ${chain.name}`;
        console.log(`  ${label.padEnd(longestNameLength)}`);
      }
      console.log(`  Hash: ${hash}`);
      console.log();
      groupNumber++;
    }

    // Display summary
    if (Object.keys(hashGroups).length === 1) {
      console.log("✅ All implementations have the same creation bytecode");
    } else {
      console.log(
        `⚠️ Found ${Object.keys(hashGroups).length} different creation bytecode versions`
      );
    }

    // List chains where we couldn't get creation bytecode
    const missingCreationCode = results.filter((r) => r.bytecodeHash === null);
    if (missingCreationCode.length > 0) {
      console.log("\nChains without creation bytecode data:");
      for (const result of missingCreationCode) {
        const label = `${result.chainEmoji} ${chainConfigs[result.chainName].name}`;
        console.log(`  ${label.padEnd(longestNameLength)}`);
      }
    }
  } catch (error) {
    console.error("Error comparing bytecodes:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  showBytecodes().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
