import dotenv from "dotenv";
import { showBalances } from "./commands/balances";
import { showBytecodes } from "./commands/bytecodes";
import { executeTransfer } from "./commands/transfer";
import { checkVerifiedImplementations } from "./commands/verified";

// Load environment variables
dotenv.config();

// Simple command router
async function main() {
  // Get command from command line arguments
  const command = process.argv[2] || "transfer";

  try {
    // Execute the requested command
    switch (command) {
      case "balances":
        await showBalances();
        break;
      case "bytecodes":
        await showBytecodes();
        break;
      case "verified":
        await checkVerifiedImplementations();
        break;
      case "transfer":
        await executeTransfer();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(
          "Available commands: balances, bytecodes, verified, transfer"
        );
        process.exit(1);
    }
  } catch (error) {
    console.error("Error executing command:", error);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
