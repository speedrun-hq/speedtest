import dotenv from "dotenv";
import { ethers } from "ethers";
import { Command } from "commander";
import { EvmClient } from "../evm/client";
import { CHAINS, CURRENT_NETWORK } from "../constants";

// Load environment variables
dotenv.config();

// Define a type for balance entries
interface BalanceEntry {
  chain: string;
  name: string;
  emoji: string;
  balance: string;
}

export async function showBalances() {
  // Setup command line parser
  const program = new Command();

  program
    .option("-a, --address <address>", "Address to check balances for")
    .parse(process.argv);

  const options = program.opts();

  // Get private key from environment
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: EVM_PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  try {
    // Get wallet address from private key
    const wallet = new ethers.Wallet(privateKey);

    // Use the provided address or default to the wallet address
    const targetAddress = options.address || wallet.address;

    console.log(`\nShowing balances for address: ${targetAddress}`);

    // If using a custom address, add a note that we're in read-only mode
    if (options.address) {
      console.log("(Read-only mode - using your wallet to query balances)");
    }

    console.log("-".repeat(50));

    // Get chain configs for the current network
    const chainConfigs = CHAINS[CURRENT_NETWORK];

    // Store balances by token type
    const balances: {
      native: BalanceEntry[];
      usdc: BalanceEntry[];
      usdt: BalanceEntry[];
    } = {
      native: [],
      usdc: [],
      usdt: [],
    };

    // Total values
    let totalUsdcValue = 0;
    let totalUsdtValue = 0;

    // Fetch all balances
    for (const [chainName, chainConfig] of Object.entries(chainConfigs)) {
      try {
        // Create client for this chain
        const client = new EvmClient(chainConfig, privateKey);

        // Get native balance
        const nativeBalance = await client.getBalance(targetAddress);
        // Format native balance to 3 decimal places max
        const formattedNativeBalance = parseFloat(nativeBalance).toFixed(3);
        balances.native.push({
          chain: chainName,
          name: chainConfig.name,
          emoji: chainConfig.emoji,
          balance: formattedNativeBalance,
        });

        // Get USDC balance
        const usdcBalance = await client.getTokenBalance(
          chainConfig.usdc,
          targetAddress
        );
        const usdcNumeric = parseFloat(usdcBalance);
        totalUsdcValue += isNaN(usdcNumeric) ? 0 : usdcNumeric;
        // Format USDC balance to 2 decimal places max
        const formattedUsdcBalance = usdcNumeric.toFixed(2);
        balances.usdc.push({
          chain: chainName,
          name: chainConfig.name,
          emoji: chainConfig.emoji,
          balance: formattedUsdcBalance,
        });

        // Get USDT balance if available for this chain
        if (chainConfig.usdt) {
          const usdtBalance = await client.getTokenBalance(
            chainConfig.usdt,
            targetAddress
          );
          const usdtNumeric = parseFloat(usdtBalance);
          totalUsdtValue += isNaN(usdtNumeric) ? 0 : usdtNumeric;
          // Format USDT balance to 2 decimal places max
          const formattedUsdtBalance = usdtNumeric.toFixed(2);
          balances.usdt.push({
            chain: chainName,
            name: chainConfig.name,
            emoji: chainConfig.emoji,
            balance: formattedUsdtBalance,
          });
        }
      } catch (error) {
        console.error(`Error fetching balances for ${chainName}:`, error);
      }
    }

    // Find the longest network name for alignment
    const longestNameLength = Math.max(
      ...Object.values(chainConfigs).map(
        (config) => (config.emoji + " " + config.name).length
      )
    );

    // Display USDC balances
    console.log("\nUSDC:");
    console.log("-".repeat(50));
    for (const item of balances.usdc) {
      const label = `${item.emoji} ${item.name}`;
      console.log(`  ${label.padEnd(longestNameLength)}: ${item.balance}`);
    }
    console.log(
      `  ${"Total".padEnd(longestNameLength)}: ${totalUsdcValue.toFixed(2)}`
    );

    // Display USDT balances
    console.log("\nUSDT:");
    console.log("-".repeat(50));
    for (const item of balances.usdt) {
      const label = `${item.emoji} ${item.name}`;
      console.log(`  ${label.padEnd(longestNameLength)}: ${item.balance}`);
    }
    console.log(
      `  ${"Total".padEnd(longestNameLength)}: ${totalUsdtValue.toFixed(2)}`
    );

    // Display native token balances last
    console.log("\nNative Tokens:");
    console.log("-".repeat(50));
    for (const item of balances.native) {
      const label = `${item.emoji} ${item.name}`;
      console.log(`  ${label.padEnd(longestNameLength)}: ${item.balance}`);
    }
  } catch (error) {
    console.error("Error showing balances:", error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  showBalances().catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
