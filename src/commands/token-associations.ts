import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { Command } from "commander";
import {
  CHAINS,
  CURRENT_NETWORK,
  ZETACHAIN_ROUTER_CONTRACT,
} from "../constants";

// Load environment variables
dotenv.config();

// Router contract ABI for the getTokenAssociations function
const routerAbi = [
  "function getTokenAssociations(string calldata name) public view returns (uint256[] memory chainIds, address[] memory assets, address[] memory zrc20s)",
];

// Define a type for token association entries
interface TokenAssociationEntry {
  chainId: number;
  chainName: string;
  emoji: string;
  asset: string;
  zrc20: string;
}

// Define a type for token associations
interface TokenAssociations {
  tokenName: string;
  associations: TokenAssociationEntry[];
}

export async function showTokenAssociations() {
  // Setup command line parser
  const program = new Command();

  program.parse(process.argv);

  try {
    // Get chain configs for the current network
    const chainConfigs = CHAINS[CURRENT_NETWORK];

    // Get ZetaChain config for making the contract call
    const zetaChainConfig = chainConfigs.zetachain;
    if (!zetaChainConfig) {
      console.error("Error: ZetaChain configuration not found");
      process.exit(1);
    }

    console.log(
      `\nFetching token associations from ZetaChain router contract:`
    );
    console.log(`Contract: ${ZETACHAIN_ROUTER_CONTRACT}`);
    console.log("-".repeat(50));

    // Create ZetaChain provider directly (no private key needed for read operations)
    const zetaProvider = new ethers.JsonRpcProvider(zetaChainConfig.rpc);

    // Create router contract instance
    const routerContract = new ethers.Contract(
      ZETACHAIN_ROUTER_CONTRACT,
      routerAbi,
      zetaProvider
    );

    // Create a mapping from chainId to chain config for easy lookup
    const chainIdToConfig = new Map<number, any>();
    for (const [chainName, chainConfig] of Object.entries(chainConfigs)) {
      chainIdToConfig.set(chainConfig.chainId, { ...chainConfig, chainName });
    }

    // Tokens to query
    const tokens = ["USDC", "USDT"];
    const results: TokenAssociations[] = [];

    for (const tokenName of tokens) {
      try {
        console.log(`\nQuerying associations for ${tokenName}...`);

        // Call the getTokenAssociations function
        const [chainIds, assets, zrc20s] =
          await routerContract.getTokenAssociations(tokenName);

        const associations: TokenAssociationEntry[] = [];

        // Process the results
        for (let i = 0; i < chainIds.length; i++) {
          const chainId = Number(chainIds[i]);
          const asset = assets[i];
          const zrc20 = zrc20s[i];

          // Get chain config for this chainId
          const chainConfig = chainIdToConfig.get(chainId);

          if (chainConfig) {
            associations.push({
              chainId,
              chainName: chainConfig.name,
              emoji: chainConfig.emoji,
              asset,
              zrc20,
            });
          } else {
            // If we don't have config for this chain, still show it
            associations.push({
              chainId,
              chainName: `Chain ${chainId}`,
              emoji: "🔗",
              asset,
              zrc20,
            });
          }
        }

        results.push({
          tokenName,
          associations,
        });

        console.log(
          `  ✅ Found ${associations.length} associations for ${tokenName}`
        );
      } catch (error) {
        console.error(`  ❌ Error querying ${tokenName}:`, error);
        results.push({
          tokenName,
          associations: [],
        });
      }
    }

    // Display results in a nice format
    console.log("\n" + "=".repeat(80));
    console.log("TOKEN ASSOCIATIONS");
    console.log("=".repeat(80));

    for (const result of results) {
      console.log(`\n${result.tokenName}:`);
      console.log("-".repeat(50));

      if (result.associations.length === 0) {
        console.log("  No associations found");
        continue;
      }

      // Find the longest chain name for alignment
      const longestChainName = Math.max(
        ...result.associations.map((a) => (a.emoji + " " + a.chainName).length)
      );

      // Sort by chain name for better readability
      const sortedAssociations = result.associations.sort((a, b) =>
        a.chainName.localeCompare(b.chainName)
      );

      for (const association of sortedAssociations) {
        const chainLabel = `${association.emoji} ${association.chainName}`;
        console.log(`  ${chainLabel.padEnd(longestChainName)}:`);
        console.log(`    Chain ID: ${association.chainId}`);
        console.log(`    Asset:    ${association.asset}`);
        console.log(`    ZRC20:    ${association.zrc20}`);
        console.log("");
      }
    }
  } catch (error) {
    console.error("Error showing token associations:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  showTokenAssociations().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
