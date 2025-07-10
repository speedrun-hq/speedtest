import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { Command } from "commander";
import { EvmClient } from "../evm/client";
import {
  CHAINS,
  CURRENT_NETWORK,
  ZETACHAIN_ROUTER_CONTRACT,
} from "../constants";

// Load environment variables
dotenv.config();

// Define a type for gas limit entries
interface GasLimitEntry {
  chain: string;
  name: string;
  emoji: string;
  chainId: number;
  gasLimit: string;
  gasPrice?: string;
  estimatedFee?: string;
  gasTokenName: string;
}

// Router contract ABI for the getChainGasLimit function
const routerAbi = [
  "function getChainGasLimit(uint256 chainId) public view returns (uint256)",
];

export async function showGasLimits() {
  // Setup command line parser
  const program = new Command();

  program.parse(process.argv);

  // Get private key from environment
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: EVM_PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  try {
    // Get chain configs for the current network
    const chainConfigs = CHAINS[CURRENT_NETWORK];

    // Get ZetaChain config for making the contract call
    const zetaChainConfig = chainConfigs.zetachain;
    if (!zetaChainConfig) {
      console.error("Error: ZetaChain configuration not found");
      process.exit(1);
    }

    console.log(`\nFetching gas limits from ZetaChain router contract:`);
    console.log(`Contract: ${ZETACHAIN_ROUTER_CONTRACT}`);
    console.log("-".repeat(50));

    // Create ZetaChain client
    const zetaClient = new EvmClient(zetaChainConfig, privateKey);

    // Create router contract instance
    const routerContract = new ethers.Contract(
      ZETACHAIN_ROUTER_CONTRACT,
      routerAbi,
      zetaClient.getProvider()
    );

    // Store gas limits
    const gasLimits: GasLimitEntry[] = [];

    // Query gas limits for all chains except ZetaChain
    for (const [chainName, chainConfig] of Object.entries(chainConfigs)) {
      // Skip ZetaChain itself
      if (chainName === "zetachain") {
        continue;
      }

      try {
        console.log(
          `Querying gas limit for ${chainConfig.emoji} ${chainConfig.name} (Chain ID: ${chainConfig.chainId})...`
        );

        // Call the getChainGasLimit function
        const gasLimit = await routerContract.getChainGasLimit(
          chainConfig.chainId
        );

        // Create a provider for this chain to get gas price
        const chainProvider = new ethers.JsonRpcProvider(chainConfig.rpc);
        let gasPrice: string | undefined;
        let estimatedFee: string | undefined;

        try {
          // Get gas price from the chain
          const gasPriceWei = await chainProvider.getFeeData();
          if (gasPriceWei.gasPrice) {
            gasPrice = ethers.formatUnits(gasPriceWei.gasPrice, "gwei");

            // Calculate estimated fee: gasLimit * gasPrice
            const gasLimitBigInt = BigInt(gasLimit.toString());
            const gasPriceBigInt = gasPriceWei.gasPrice;
            const feeWei = gasLimitBigInt * gasPriceBigInt;
            estimatedFee = ethers.formatUnits(
              feeWei,
              chainConfig.gasToken.decimals
            );
          }
        } catch (gasPriceError) {
          console.log(
            `  ⚠️ Could not fetch gas price for ${chainConfig.name}: ${gasPriceError}`
          );
        }

        gasLimits.push({
          chain: chainName,
          name: chainConfig.name,
          emoji: chainConfig.emoji,
          chainId: chainConfig.chainId,
          gasLimit: gasLimit.toString(),
          gasPrice,
          estimatedFee,
          gasTokenName: chainConfig.gasToken.name,
        });

        console.log(`  ✅ Gas limit: ${gasLimit.toString()}`);
        if (gasPrice) {
          console.log(`  ✅ Gas price: ${gasPrice} gwei`);
          console.log(
            `  ✅ Estimated fee: ${estimatedFee} ${chainConfig.gasToken.name}`
          );
        }
      } catch (error) {
        console.error(
          `  ❌ Error fetching gas limit for ${chainConfig.name}:`,
          error
        );
        // Still add the entry with error info
        gasLimits.push({
          chain: chainName,
          name: chainConfig.name,
          emoji: chainConfig.emoji,
          chainId: chainConfig.chainId,
          gasLimit: "Error",
          gasTokenName: chainConfig.gasToken.name,
        });
      }
    }

    // Find the longest network name for alignment
    const longestNameLength = Math.max(
      ...Object.values(chainConfigs)
        .filter((config) => config.name !== "ZetaChain") // Exclude ZetaChain from alignment calculation
        .map((config) => (config.emoji + " " + config.name).length)
    );

    // Display gas limits in a formatted table
    console.log("\nGas Limits and Estimated Fees by Chain:");
    console.log("-".repeat(80));
    for (const item of gasLimits) {
      const label = `${item.emoji} ${item.name}`;
      const chainIdStr = `(ID: ${item.chainId})`;

      if (item.gasLimit === "Error") {
        console.log(
          `  ${label.padEnd(longestNameLength)} ${chainIdStr.padEnd(12)}: Error fetching data`
        );
      } else {
        const gasLimitStr = `Gas: ${item.gasLimit}`;
        const gasPriceStr = item.gasPrice
          ? ` | Price: ${item.gasPrice} gwei`
          : "";
        const feeStr = item.estimatedFee
          ? ` | Fee: ${item.estimatedFee} ${item.gasTokenName}`
          : "";

        console.log(
          `  ${label.padEnd(longestNameLength)} ${chainIdStr.padEnd(12)}: ${gasLimitStr}${gasPriceStr}${feeStr}`
        );
      }
    }

    // Summary
    console.log("\nSummary:");
    console.log("-".repeat(80));
    const successfulQueries = gasLimits.filter(
      (item) => item.gasLimit !== "Error"
    ).length;
    const totalQueries = gasLimits.length;
    console.log(
      `  Successfully queried: ${successfulQueries}/${totalQueries} chains`
    );

    if (successfulQueries > 0) {
      const avgGasLimit =
        gasLimits
          .filter((item) => item.gasLimit !== "Error")
          .reduce((sum, item) => sum + BigInt(item.gasLimit), BigInt(0)) /
        BigInt(successfulQueries);
      console.log(`  Average gas limit: ${avgGasLimit.toString()}`);

      // Calculate average gas price and fee for chains where we have the data
      const chainsWithGasPrice = gasLimits.filter(
        (item) => item.gasPrice && item.estimatedFee
      );
      if (chainsWithGasPrice.length > 0) {
        const avgGasPrice =
          chainsWithGasPrice.reduce(
            (sum, item) => sum + parseFloat(item.gasPrice!),
            0
          ) / chainsWithGasPrice.length;
        console.log(`  Average gas price: ${avgGasPrice.toFixed(2)} gwei`);

        // Group fees by token for better summary
        const feesByToken: Record<string, number[]> = {};
        chainsWithGasPrice.forEach((item) => {
          if (!feesByToken[item.gasTokenName]) {
            feesByToken[item.gasTokenName] = [];
          }
          feesByToken[item.gasTokenName].push(parseFloat(item.estimatedFee!));
        });

        console.log("  Average fees by token:");
        Object.entries(feesByToken).forEach(([token, fees]) => {
          const avgFee = fees.reduce((sum, fee) => sum + fee, 0) / fees.length;
          console.log(`    ${token}: ${avgFee.toFixed(6)}`);
        });
      }
    }
  } catch (error) {
    console.error("Error showing gas limits:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  showGasLimits().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
