import dotenv from 'dotenv';
import { ethers } from 'ethers';
import { EvmClient } from '../evm/client';
import { CHAINS, CURRENT_NETWORK } from '../constants';

// Load environment variables
dotenv.config();

async function showBalances() {
  // Get private key from environment
  const privateKey = process.env.EVM_PRIVATE_KEY;
  if (!privateKey) {
    console.error('Error: EVM_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  try {
    // Get wallet address from private key
    const wallet = new ethers.Wallet(privateKey);
    console.log(`\nShowing balances for wallet: ${wallet.address}`);
    console.log('-'.repeat(50));

    // Get chain configs for the current network
    const chainConfigs = CHAINS[CURRENT_NETWORK];
    
    // Track total USDC value across all chains
    let totalUsdcValue = 0;

    // Check balances on each chain
    for (const [chainName, chainConfig] of Object.entries(chainConfigs)) {
      try {
        // Create client for this chain
        const client = new EvmClient(chainConfig, privateKey);
        
        // Get native and USDC balances
        const nativeBalance = await client.getBalance();
        const usdcBalance = await client.getTokenBalance(chainConfig.usdc);
        
        // Parse USDC balance to number for total calculation
        const usdcNumeric = parseFloat(usdcBalance);
        totalUsdcValue += isNaN(usdcNumeric) ? 0 : usdcNumeric;
        
        console.log(`\n${chainConfig.name} (${chainName}):`);
        console.log(`  Native token: ${nativeBalance} ${chainName === 'base' || chainName === 'arbitrum' ? 'ETH' : 'Native'}`);
        console.log(`  USDC: ${usdcBalance}`);
      } catch (error) {
        console.error(`Error fetching balances for ${chainName}:`, error);
      }
    }
    
    console.log('\n' + '-'.repeat(50));
    console.log(`Total USDC across all chains: ${totalUsdcValue.toFixed(6)}`);

  } catch (error) {
    console.error('Error showing balances:', error);
    process.exit(1);
  }
}

// Run the command
showBalances().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
}); 