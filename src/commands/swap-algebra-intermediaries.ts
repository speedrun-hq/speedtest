import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { Command } from "commander";
import {
  CHAINS,
  CURRENT_NETWORK,
  ZETACHAIN_SWAP_ALGEBRA_CONTRACT,
} from "../constants";

// Load environment variables
dotenv.config();

// SwapAlgebra contract ABI for the intermediaryTokens mapping
const swapAlgebraAbi = [
  "function intermediaryTokens(string calldata tokenName) public view returns (address)",
];

// Define a type for intermediary token entries
interface IntermediaryTokenEntry {
  tokenName: string;
  intermediaryAddress: string;
}

export async function showSwapAlgebraIntermediaries() {
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
      `\nFetching intermediary tokens from ZetaChain SwapAlgebra contract:`
    );
    console.log(`Contract: ${ZETACHAIN_SWAP_ALGEBRA_CONTRACT}`);
    console.log("-".repeat(50));

    // Create ZetaChain provider directly (no private key needed for read operations)
    const zetaProvider = new ethers.JsonRpcProvider(zetaChainConfig.rpc);

    // Create SwapAlgebra contract instance
    const swapAlgebraContract = new ethers.Contract(
      ZETACHAIN_SWAP_ALGEBRA_CONTRACT,
      swapAlgebraAbi,
      zetaProvider
    );

    // Tokens to query
    const tokens = ["USDC", "USDT"];
    const results: IntermediaryTokenEntry[] = [];

    for (const tokenName of tokens) {
      try {
        console.log(`\nQuerying intermediary token for ${tokenName}...`);

        // Call the intermediaryTokens function
        const intermediaryAddress =
          await swapAlgebraContract.intermediaryTokens(tokenName);

        results.push({
          tokenName,
          intermediaryAddress,
        });

        console.log(`  ✅ Found intermediary: ${intermediaryAddress}`);
      } catch (error) {
        console.error(`  ❌ Error querying ${tokenName}:`, error);
        results.push({
          tokenName,
          intermediaryAddress: "Error",
        });
      }
    }

    // Display results in a nice format
    console.log("\n" + "=".repeat(80));
    console.log("SWAP ALGEBRA INTERMEDIARY TOKENS");
    console.log("=".repeat(80));

    if (results.length === 0) {
      console.log("  No intermediary tokens found");
      return;
    }

    // Find the longest token name for alignment
    const longestTokenName = Math.max(
      ...results.map((r) => r.tokenName.length)
    );

    for (const result of results) {
      console.log(
        `\n${result.tokenName.padEnd(longestTokenName)}: ${result.intermediaryAddress}`
      );
    }

    console.log("\n" + "-".repeat(80));
    console.log(
      "Note: These are the intermediary tokens used by SwapAlgebra for token swaps"
    );
    console.log("on ZetaChain. They act as bridge tokens in the swap process.");
  } catch (error) {
    console.error("Error showing SwapAlgebra intermediaries:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  showSwapAlgebraIntermediaries().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
