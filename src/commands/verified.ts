import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { CHAINS, CURRENT_NETWORK } from "../constants";
import { checkContractVerification } from "../explorer/verified";

// Load environment variables
dotenv.config();

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

export async function checkVerifiedImplementations() {
  try {
    console.log(
      "\nChecking verification status of intent implementation contracts:"
    );
    console.log("-".repeat(80));

    // Get chain configs for the current network
    const chainConfigs = CHAINS[CURRENT_NETWORK];

    // Find the longest network name for alignment
    const longestNameLength = Math.max(
      ...Object.entries(chainConfigs).map(
        ([_, config]) => (config.emoji + " " + config.name).length
      )
    );

    // Organize results for better display
    const verifiedChains: string[] = [];
    const unverifiedChains: string[] = [];
    const errorChains: string[] = [];
    const noExplorerChains: string[] = [];

    // Check verification status for each chain
    for (const [chainName, chainConfig] of Object.entries(chainConfigs)) {
      try {
        // Skip if no explorer configured
        if (!chainConfig.explorer) {
          const label = `${chainConfig.emoji} ${chainConfig.name}`;
          console.log(
            `${label.padEnd(longestNameLength)}: No explorer configured`
          );
          noExplorerChains.push(chainName);
          continue;
        }

        // Create provider for this chain
        const provider = new ethers.JsonRpcProvider(chainConfig.rpc);

        // Get implementation address from proxy
        console.log(`Checking ${chainConfig.emoji} ${chainConfig.name}...`);

        let implAddress;
        try {
          implAddress = await getImplementationAddress(
            provider,
            chainConfig.intent
          );
          console.log(`  Implementation address: ${implAddress}`);
        } catch (error) {
          console.error(`  ❌ Error getting implementation address: ${error}`);
          errorChains.push(chainName);
          continue;
        }

        // Check if the implementation contract is verified
        const verificationStatus = await checkContractVerification(
          chainName,
          chainConfig.explorer,
          implAddress
        );

        // Display verification status
        const label = `${chainConfig.emoji} ${chainConfig.name}`;
        if (verificationStatus.isVerified) {
          console.log(
            `  ✅ ${label.padEnd(longestNameLength)}: VERIFIED (${verificationStatus.timestamp || ""})`
          );
          verifiedChains.push(chainName);
        } else {
          console.log(
            `  ❌ ${label.padEnd(longestNameLength)}: NOT VERIFIED (${verificationStatus.message})`
          );
          unverifiedChains.push(chainName);
        }
      } catch (error) {
        console.error(`Error checking verification for ${chainName}:`, error);
        errorChains.push(chainName);
      }
    }

    // Display summary
    console.log("\n\nSummary:");
    console.log("-".repeat(80));

    // Show verified chains
    if (verifiedChains.length > 0) {
      console.log("\n✅ Verified implementation contracts:");
      for (const chainName of verifiedChains) {
        const config = chainConfigs[chainName];
        const label = `${config.emoji} ${config.name}`;
        console.log(`  ${label.padEnd(longestNameLength)}`);
      }
    }

    // Show unverified chains
    if (unverifiedChains.length > 0) {
      console.log("\n❌ Unverified implementation contracts:");
      for (const chainName of unverifiedChains) {
        const config = chainConfigs[chainName];
        const label = `${config.emoji} ${config.name}`;
        console.log(`  ${label.padEnd(longestNameLength)}`);
      }
    }

    // Show chains with errors
    if (errorChains.length > 0) {
      console.log("\n⚠️ Chains with errors:");
      for (const chainName of errorChains) {
        const config = chainConfigs[chainName];
        const label = `${config.emoji} ${config.name}`;
        console.log(`  ${label.padEnd(longestNameLength)}`);
      }
    }

    // Show chains without explorers
    if (noExplorerChains.length > 0) {
      console.log("\n📝 Chains without explorer configuration:");
      for (const chainName of noExplorerChains) {
        const config = chainConfigs[chainName];
        const label = `${config.emoji} ${config.name}`;
        console.log(`  ${label.padEnd(longestNameLength)}`);
      }
    }

    // Final statistics
    console.log(
      `\nVerified: ${verifiedChains.length}/${Object.keys(chainConfigs).length - noExplorerChains.length} chains`
    );
  } catch (error) {
    console.error("Error checking verified implementations:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  checkVerifiedImplementations().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
