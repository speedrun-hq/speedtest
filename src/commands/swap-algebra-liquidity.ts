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

// SwapAlgebra contract ABI
const swapAlgebraAbi = [
  "function algebraFactory() public view returns (address)",
  "function intermediaryTokens(string calldata tokenName) public view returns (address)",
];

// Algebra Factory ABI
const algebraFactoryAbi = [
  "function poolByPair(address tokenA, address tokenB) public view returns (address)",
];

// Algebra Pool ABI
const algebraPoolAbi = [
  "function token0() public view returns (address)",
  "function token1() public view returns (address)",
  "function getReserves() public view returns (uint256 reserve0, uint256 reserve1, uint32 blockTimestampLast)",
];

// ERC20 Token ABI for decimals and symbol
const erc20Abi = [
  "function decimals() public view returns (uint8)",
  "function symbol() public view returns (string)",
];

// Define a type for liquidity entries
interface LiquidityEntry {
  tokenName: string;
  zrc20Address: string;
  intermediaryAddress: string;
  poolAddress: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  reserve0: string;
  reserve1: string;
  reserve0Formatted: string;
  reserve1Formatted: string;
  reserve0USD: string;
  reserve1USD: string;
  totalLiquidityUSD: string;
}

export async function showSwapAlgebraLiquidity() {
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

    console.log(`\nFetching liquidity from ZetaChain SwapAlgebra pools:`);
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

    // Get the Algebra Factory address
    console.log("\nGetting Algebra Factory address...");
    const algebraFactoryAddress = await swapAlgebraContract.algebraFactory();
    console.log(`✅ Algebra Factory: ${algebraFactoryAddress}`);

    // Create Algebra Factory contract instance
    const algebraFactoryContract = new ethers.Contract(
      algebraFactoryAddress,
      algebraFactoryAbi,
      zetaProvider
    );

    // Get ZRC20 addresses from token associations (we'll use the constants for now)
    const zrc20Addresses = {
      USDC: zetaChainConfig.usdc,
      USDT: zetaChainConfig.usdt!,
    };

    // Get all ZRC20 addresses from token associations
    console.log("\nGetting token associations to find all ZRC20 tokens...");

    // Import the router contract ABI and address
    const routerAbi = [
      "function getTokenAssociations(string calldata name) public view returns (uint256[] memory chainIds, address[] memory assets, address[] memory zrc20s)",
    ];

    const routerContract = new ethers.Contract(
      "0xcd74f36bad8f842641e67ec390be092a243297d6", // ZETACHAIN_ROUTER_CONTRACT
      routerAbi,
      zetaProvider
    );

    // Get all ZRC20 addresses for each token
    const allZrc20Addresses: { [tokenName: string]: string[] } = {};

    const tokens = ["USDC", "USDT"];
    for (const tokenName of tokens) {
      try {
        const [chainIds, assets, zrc20s] =
          await routerContract.getTokenAssociations(tokenName);
        allZrc20Addresses[tokenName] = zrc20s.map((zrc20: string) => zrc20);
        console.log(`  Found ${zrc20s.length} ZRC20 tokens for ${tokenName}`);
      } catch (error) {
        console.error(`  Error getting associations for ${tokenName}:`, error);
        allZrc20Addresses[tokenName] = [
          zrc20Addresses[tokenName as keyof typeof zrc20Addresses],
        ];
      }
    }

    // Tokens to query
    const results: LiquidityEntry[] = [];

    for (const tokenName of tokens) {
      try {
        console.log(`\nQuerying liquidity for ${tokenName}...`);

        // Get intermediary token address
        const intermediaryAddress =
          await swapAlgebraContract.intermediaryTokens(tokenName);
        console.log(`  Intermediary token: ${intermediaryAddress}`);

        // Check all ZRC20 tokens for this token name
        const zrc20Tokens = allZrc20Addresses[tokenName] || [];

        for (const zrc20Address of zrc20Tokens) {
          console.log(`  Checking ZRC20 token: ${zrc20Address}`);

          // Skip if ZRC20 and intermediary are the same (no pool needed)
          if (
            zrc20Address.toLowerCase() === intermediaryAddress.toLowerCase()
          ) {
            console.log(
              `    ⚠️ Skipping - ZRC20 and intermediary are the same token`
            );
            continue;
          }

          // Get pool address for the pair (ZRC20 <-> Intermediary)
          const poolAddress = await algebraFactoryContract.poolByPair(
            zrc20Address,
            intermediaryAddress
          );
          console.log(`    Pool address: ${poolAddress}`);

          if (poolAddress === ethers.ZeroAddress) {
            console.log(`    ⚠️ No pool found for this pair`);
            continue;
          }

          // Create pool contract instance
          const poolContract = new ethers.Contract(
            poolAddress,
            algebraPoolAbi,
            zetaProvider
          );

          // Get pool tokens and reserves
          const [token0Address, token1Address] = await Promise.all([
            poolContract.token0(),
            poolContract.token1(),
          ]);

          // Try to get reserves with error handling
          let reserve0, reserve1;
          try {
            // Try different approaches to get reserves
            const reserves = await poolContract.getReserves();

            if (Array.isArray(reserves)) {
              [reserve0, reserve1] = reserves;
            } else if (reserves && typeof reserves === "object") {
              reserve0 = reserves.reserve0 || reserves[0];
              reserve1 = reserves.reserve1 || reserves[1];
            } else {
              throw new Error(`Unexpected reserves format: ${reserves}`);
            }
          } catch (reservesError) {
            // Try alternative approach - call the function directly with raw data
            try {
              const rawData = await zetaProvider.call({
                to: poolAddress,
                data: "0x0902f1ac", // getReserves() function selector
              });

              // Try to decode manually - assuming uint256, uint256, uint32
              if (rawData.length >= 66) {
                // 0x + 32 bytes for each reserve + 4 bytes for timestamp
                const reserve0Hex = "0x" + rawData.slice(2, 66);
                const reserve1Hex = "0x" + rawData.slice(66, 130);

                reserve0 = BigInt(reserve0Hex);
                reserve1 = BigInt(reserve1Hex);
              } else {
                throw new Error(`Invalid raw data length: ${rawData.length}`);
              }
            } catch (altError) {
              console.error(`    ❌ Error getting reserves: ${altError}`);
              continue;
            }
          }

          // Create token contracts to get decimals and symbols
          const token0Contract = new ethers.Contract(
            token0Address,
            erc20Abi,
            zetaProvider
          );
          const token1Contract = new ethers.Contract(
            token1Address,
            erc20Abi,
            zetaProvider
          );

          const [token0Decimals, token1Decimals, token0Symbol, token1Symbol] =
            await Promise.all([
              token0Contract.decimals(),
              token1Contract.decimals(),
              token0Contract.symbol(),
              token1Contract.symbol(),
            ]);

          // Format reserves
          const reserve0Formatted = ethers.formatUnits(
            reserve0,
            token0Decimals
          );
          const reserve1Formatted = ethers.formatUnits(
            reserve1,
            token1Decimals
          );

          // Calculate USD values (assuming 1:1 for stablecoins)
          const reserve0USD = parseFloat(reserve0Formatted).toFixed(2);
          const reserve1USD = parseFloat(reserve1Formatted).toFixed(2);
          const totalLiquidityUSD = (
            parseFloat(reserve0USD) + parseFloat(reserve1USD)
          ).toFixed(2);

          results.push({
            tokenName: `${tokenName} (${zrc20Address.slice(0, 8)}...)`,
            zrc20Address,
            intermediaryAddress,
            poolAddress,
            token0Address,
            token1Address,
            token0Symbol,
            token1Symbol,
            token0Decimals,
            token1Decimals,
            reserve0: reserve0.toString(),
            reserve1: reserve1.toString(),
            reserve0Formatted,
            reserve1Formatted,
            reserve0USD,
            reserve1USD,
            totalLiquidityUSD,
          });

          console.log(
            `    ✅ Found pool with ${totalLiquidityUSD} USD total liquidity`
          );
        }
      } catch (error) {
        console.error(`  ❌ Error querying ${tokenName}:`, error);
      }
    }

    // Display results in a nice format
    console.log("\n" + "=".repeat(100));
    console.log("SWAP ALGEBRA POOL LIQUIDITY");
    console.log("=".repeat(100));

    if (results.length === 0) {
      console.log("  No pools found");
      return;
    }

    for (const result of results) {
      console.log(`\n${result.tokenName} Pool:`);
      console.log("-".repeat(50));
      console.log(`Pool Address: ${result.poolAddress}`);
      console.log(`ZRC20 Token:  ${result.zrc20Address}`);
      console.log(`Intermediary: ${result.intermediaryAddress}`);
      console.log("");
      console.log("Reserves:");
      console.log(
        `  ${result.token0Symbol.padEnd(10)}: ${result.reserve0Formatted.padEnd(15)} ($${result.reserve0USD})`
      );
      console.log(
        `  ${result.token1Symbol.padEnd(10)}: ${result.reserve1Formatted.padEnd(15)} ($${result.reserve1USD})`
      );
      console.log(`  Total Liquidity: $${result.totalLiquidityUSD}`);
    }

    console.log("\n" + "-".repeat(100));
    console.log(
      "Note: USD values are calculated assuming 1:1 ratio for stablecoins"
    );
    console.log(
      "These pools represent the liquidity available for swaps between"
    );
    console.log("ZRC20 tokens and their intermediary tokens on ZetaChain.");
  } catch (error) {
    console.error("Error showing SwapAlgebra liquidity:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  showSwapAlgebraLiquidity().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
