import * as dotenv from "dotenv";
import { ethers } from "ethers";
import { Command } from "commander";
import { EvmClient } from "../evm/client";
import {
  CHAINS,
  CURRENT_NETWORK,
  ZETACHAIN_ROUTER_CONTRACT,
} from "../constants";
import { priceCache, TOKEN_IDS } from "../utils/price-cache";

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
  estimatedFeeUSD?: string;
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

    // Collect unique token names for price fetching
    const uniqueTokenNames = new Set<string>();
    for (const [chainName, chainConfig] of Object.entries(chainConfigs)) {
      if (chainName !== "zetachain") {
        uniqueTokenNames.add(chainConfig.gasToken.name);
      }
    }

    // Fetch token prices from CoinGecko API
    console.log("\nFetching token prices from CoinGecko API...");
    const tokenIds = Array.from(uniqueTokenNames)
      .map((tokenName) => TOKEN_IDS[tokenName])
      .filter(Boolean);

    let tokenPrices: Record<string, { usd: number }> = {};

    if (tokenIds.length === 0) {
      console.log("⚠️ No supported tokens found for price fetching");
    } else {
      console.log(
        `Fetching prices for: ${Array.from(uniqueTokenNames).join(", ")}`
      );
      tokenPrices = await priceCache.getTokenPrices(tokenIds);

      if (Object.keys(tokenPrices).length > 0) {
        console.log("✅ Token prices fetched successfully");
      } else {
        console.log(
          "⚠️ Could not fetch token prices, USD fees will not be displayed"
        );
      }
    }

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
        let estimatedFeeUSD: string | undefined;

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

            // Calculate USD fee if we have token price
            const tokenId = TOKEN_IDS[chainConfig.gasToken.name];
            if (
              tokenId &&
              tokenPrices[tokenId] &&
              typeof tokenPrices[tokenId].usd === "number"
            ) {
              const tokenPriceUSD = tokenPrices[tokenId].usd;
              const feeAmount = parseFloat(estimatedFee);
              const feeUSD = feeAmount * tokenPriceUSD;
              estimatedFeeUSD = feeUSD.toFixed(6);
            }
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
          estimatedFeeUSD,
          gasTokenName: chainConfig.gasToken.name,
        });

        console.log(`  ✅ Gas limit: ${gasLimit.toString()}`);
        if (gasPrice) {
          console.log(`  ✅ Gas price: ${gasPrice} gwei`);
          console.log(
            `  ✅ Estimated fee: ${estimatedFee} ${chainConfig.gasToken.name}`
          );
          if (estimatedFeeUSD) {
            console.log(`  ✅ Estimated fee: $${estimatedFeeUSD} USD`);
          }
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

    // Find the longest gas limit for alignment
    const longestGasLimit = Math.max(
      ...gasLimits
        .filter((item) => item.gasLimit !== "Error")
        .map((item) => item.gasLimit.length)
    );

    // Find the longest gas price for alignment
    const longestGasPrice = Math.max(
      ...gasLimits
        .filter((item) => item.gasPrice)
        .map((item) => item.gasPrice!.length)
    );

    // Find the longest fee string for alignment
    const longestFee = Math.max(
      ...gasLimits
        .filter((item) => item.estimatedFee)
        .map((item) => `${item.estimatedFee} ${item.gasTokenName}`.length)
    );

    // Display gas limits in a formatted table
    console.log("\nGas Limits and Estimated Fees by Chain:");
    console.log("-".repeat(120));
    for (const item of gasLimits) {
      const label = `${item.emoji} ${item.name}`;
      const chainIdStr = `(ID: ${item.chainId})`;

      if (item.gasLimit === "Error") {
        console.log(
          `  ${label.padEnd(longestNameLength)} ${chainIdStr.padEnd(12)}: Error fetching data`
        );
      } else {
        const gasLimitStr = `Gas: ${item.gasLimit}`.padEnd(longestGasLimit + 5);
        const gasPriceStr = item.gasPrice
          ? ` | Price: ${item.gasPrice} gwei`.padEnd(longestGasPrice + 15)
          : " ".repeat(longestGasPrice + 15);
        const feeStr = item.estimatedFee
          ? ` | Fee: ${item.estimatedFee} ${item.gasTokenName}`.padEnd(
              longestFee + 8
            )
          : " ".repeat(longestFee + 8);
        const feeUSDStr = item.estimatedFeeUSD
          ? ` | Fee: $${item.estimatedFeeUSD} USD`
          : "";

        console.log(
          `  ${label.padEnd(longestNameLength)} ${chainIdStr.padEnd(12)}: ${gasLimitStr}${gasPriceStr}${feeStr}${feeUSDStr}`
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
        const feesUSDByToken: Record<string, number[]> = {};
        chainsWithGasPrice.forEach((item) => {
          if (!feesByToken[item.gasTokenName]) {
            feesByToken[item.gasTokenName] = [];
            feesUSDByToken[item.gasTokenName] = [];
          }
          feesByToken[item.gasTokenName].push(parseFloat(item.estimatedFee!));
          if (item.estimatedFeeUSD) {
            feesUSDByToken[item.gasTokenName].push(
              parseFloat(item.estimatedFeeUSD)
            );
          }
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
