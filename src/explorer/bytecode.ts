import axios from "axios";

// Map chain names to environment variable names for API keys
export const API_KEY_ENV_VARS: Record<string, string> = {
  base: "BASESCAN_API_KEY",
  arbitrum: "ARBISCAN_API_KEY",
  bsc: "BSCSCAN_API_KEY",
  polygon: "POLYGONSCAN_API_KEY",
  ethereum: "ETHERSCAN_API_KEY",
  avalanche: "ROUTESCAN_API_KEY", // Using RouteScan for Avalanche
  zetachain: "ZETACHAIN_API_KEY",
};

/**
 * Fetch creation bytecode from Etherscan-style APIs
 */
export async function fetchEtherscanBytecode(
  chainName: string,
  explorerUrl: string,
  address: string,
  apiKey: string
): Promise<string | null> {
  try {
    console.log(
      `    Fetching contract creation from Etherscan-style API for ${chainName}`
    );

    // Special handling for Avalanche (RouteScan)
    const useFixedApiKey = chainName === "avalanche";
    const effectiveApiKey = useFixedApiKey ? "verifyContract" : apiKey;

    // First get the transaction hash that created the contract
    const url = `${explorerUrl}/api?module=contract&action=getcontractcreation&contractaddresses=${address}&apikey=${effectiveApiKey}`;

    const response = await axios.get(url);

    if (
      response.data.status === "1" &&
      response.data.result &&
      response.data.result.length > 0
    ) {
      // The transaction hash that created the contract
      const txHash = response.data.result[0].txHash;
      console.log(`    Found creation transaction: ${txHash}`);

      // Now fetch the transaction to get the input data (creation bytecode)
      const txUrl = `${explorerUrl}/api?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${effectiveApiKey}`;

      const txResponse = await axios.get(txUrl);

      if (txResponse.data.result && txResponse.data.result.input) {
        console.log(`    Successfully retrieved transaction input data`);
        return txResponse.data.result.input;
      } else {
        console.log(`    No input data in transaction`);
      }
    } else {
      console.log(`    Contract creation transaction not found`);
    }

    return null;
  } catch (error: any) {
    console.error(
      `    ❌ Etherscan API error for ${chainName}:`,
      error.message || String(error)
    );
    if (error.response) {
      console.error(`    Response status: ${error.response.status}`);
    }
    return null;
  }
}

/**
 * Fetch creation bytecode from Blockscout API (used by ZetaChain)
 */
export async function fetchBlockscoutBytecode(
  chainName: string,
  explorerUrl: string,
  address: string,
  apiKey: string
): Promise<string | null> {
  try {
    console.log(`    Using Blockscout API for ${chainName}`);

    // First, get contract information
    const url = `${explorerUrl}/v2/addresses/${address}`;
    console.log(`    Fetching address info from ${url}`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (response.data && response.data.is_contract) {
      // Then fetch the creation transaction
      const txHash = response.data.creation_tx_hash;

      if (txHash) {
        console.log(`    Found creation transaction: ${txHash}`);

        // Get transaction details
        const txUrl = `${explorerUrl}/v2/transactions/${txHash}`;
        console.log(`    Fetching transaction data from ${txUrl}`);

        const txResponse = await axios.get(txUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (txResponse.data && txResponse.data.raw_input) {
          console.log(`    Successfully retrieved raw transaction input`);
          return txResponse.data.raw_input;
        } else {
          console.log(`    No raw_input in transaction data`);
        }
      } else {
        console.log(
          `    No creation transaction hash found, trying smart contract endpoint`
        );

        // Try smart contract endpoint
        const contractUrl = `${explorerUrl}/v2/smart-contracts/${address}`;
        console.log(`    Fetching contract data from ${contractUrl}`);

        const contractResponse = await axios.get(contractUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (contractResponse.data && contractResponse.data.creation_bytecode) {
          console.log(
            `    Successfully retrieved creation bytecode from smart contract endpoint`
          );
          return contractResponse.data.creation_bytecode;
        } else {
          console.log(`    No creation_bytecode in contract data`);
        }
      }
    } else {
      console.log(`    Address is not identified as a contract in Blockscout`);
    }

    return null;
  } catch (error: any) {
    console.error(
      `    ❌ Blockscout API error for ${chainName}:`,
      error.message || String(error)
    );
    if (error.response) {
      console.error(`    Response status: ${error.response.status}`);
      console.error(
        `    Response data:`,
        JSON.stringify(error.response.data).slice(0, 200)
      );
    }
    return null;
  }
}

/**
 * Fetch creation bytecode from the appropriate explorer API based on chain
 */
export async function fetchCreationBytecode(
  chainName: string,
  explorerUrl: string,
  address: string
): Promise<string | null> {
  try {
    // Special case for Avalanche - use fixed API key "verifyContract"
    if (chainName === "avalanche") {
      console.log(
        `    Using RouteScan API for Avalanche with fixed API key "verifyContract"`
      );
      return fetchEtherscanBytecode(
        chainName,
        explorerUrl,
        address,
        "verifyContract"
      );
    }

    if (!API_KEY_ENV_VARS[chainName]) {
      console.log(
        `    ⚠️ No API key environment variable defined for ${chainName}`
      );
      return null;
    }

    const apiKey = process.env[API_KEY_ENV_VARS[chainName]];

    if (!apiKey && chainName !== "avalanche") {
      console.log(
        `    ⚠️ No API key found for ${chainName} in environment variables`
      );
      return null;
    }

    // Use the appropriate explorer API based on chain
    if (chainName === "zetachain") {
      return fetchBlockscoutBytecode(chainName, explorerUrl, address, apiKey!);
    } else {
      return fetchEtherscanBytecode(chainName, explorerUrl, address, apiKey!);
    }
  } catch (error: any) {
    console.error(
      `    ❌ Error fetching from ${chainName} explorer:`,
      error.message || String(error)
    );
    return null;
  }
}
