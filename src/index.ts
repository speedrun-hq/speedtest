import * as dotenv from "dotenv";
import { Command } from "commander";
import { showBalances } from "./commands/balances";
import { showBytecodes } from "./commands/bytecodes";
import { checkVerifiedImplementations } from "./commands/verified";
// Import the transfer function directly here but execute it through the command line
import { executeTransfer } from "./commands/transfer";
// Import the new call function
import { executeCall } from "./commands/call";

// Load environment variables
dotenv.config();

// Setup main CLI program
const program = new Command();

program
  .name("speedtest")
  .description("A tool to perform E2E tests on Speedrun exchange network")
  .version("1.0.0");

// Add commands
program
  .command("balances")
  .description("Check token balances across supported chains")
  .option("-a, --address <address>", "Address to check balances for")
  .action(async () => {
    try {
      await showBalances();
    } catch (error) {
      console.error("Error executing balances command:", error);
      process.exit(1);
    }
  });

program
  .command("bytecodes")
  .description("Compare intent contract bytecodes across networks")
  .action(async () => {
    try {
      await showBytecodes();
    } catch (error) {
      console.error("Error executing bytecodes command:", error);
      process.exit(1);
    }
  });

program
  .command("verified")
  .description("Check contract verification status across networks")
  .action(async () => {
    try {
      await checkVerifiedImplementations();
    } catch (error) {
      console.error("Error executing verified command:", error);
      process.exit(1);
    }
  });

program
  .command("transfer")
  .description("Initiate a cross-chain token transfer")
  .option("-s, --src <chain>", "Source chain", "base")
  .option("-d, --dst <chain>", "Destination chain", "arbitrum")
  .option("-a, --asset <token>", "Token to transfer", "usdc")
  .option("-m, --amount <amount>", "Amount to transfer", "0.3")
  .option("-f, --fee <fee>", "Fee/tip amount", "0.2")
  .action(async () => {
    try {
      await executeTransfer();
    } catch (error) {
      console.error("Error executing transfer command:", error);
      process.exit(1);
    }
  });

program
  .command("call")
  .description("Initiate a cross-chain call via initiator contract")
  .option("-s, --src <chain>", "Source chain", "arbitrum")
  .option("-d, --dst <chain>", "Destination chain", "base")
  .option("-a, --amount <amount>", "Amount to swap", "0.5")
  .option("-f, --fee <fee>", "Fee/tip amount", "0.2")
  .option("-g, --gas <limit>", "Gas limit", "600000")
  .action(async () => {
    try {
      await executeCall();
    } catch (error) {
      console.error("Error executing call command:", error);
      process.exit(1);
    }
  });

// Default command is transfer
if (process.argv.length === 2) {
  process.argv.push("transfer");
}

// Parse arguments and execute
program.parse();
