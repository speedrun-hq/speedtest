import axios from "axios";
import { API_KEY_ENV_VARS } from "./bytecode";

/**
 * Interface for verification status response
 */
export interface VerificationStatus {
  isVerified: boolean;
  message: string;
  timestamp?: string;
  sourceCode?: string;
}

/**
 * Check if a contract is verified on Etherscan-style APIs
 */
export async function checkEtherscanVerification(
  chainName: string,
  explorerUrl: string,
  address: string,
  apiKey: string
): Promise<VerificationStatus> {
  try {
    console.log(`    Checking verification status on ${chainName} explorer...`);

    // Special handling for Avalanche (RouteScan)
    const useFixedApiKey = chainName === "avalanche";
    const effectiveApiKey = useFixedApiKey ? "verifyContract" : apiKey;

    // Query the explorer API for source code
    const url = `${explorerUrl}/api?module=contract&action=getsourcecode&address=${address}&apikey=${effectiveApiKey}`;

    const response = await axios.get(url);

    if (
      response.data.status === "1" &&
      response.data.result &&
      response.data.result.length > 0
    ) {
      const contractInfo = response.data.result[0];

      // Contract is verified if SourceCode is not empty and not "Unverified"
      const isVerified =
        contractInfo.SourceCode &&
        contractInfo.SourceCode !== "" &&
        contractInfo.SourceCode !== "Contract source code not verified";

      if (isVerified) {
        return {
          isVerified: true,
          message: "Contract is verified",
          timestamp:
            contractInfo.CompilerVersion ||
            contractInfo.VerifiedAt ||
            "Unknown",
          sourceCode:
            contractInfo.SourceCode?.length > 100
              ? contractInfo.SourceCode.substring(0, 100) + "..."
              : contractInfo.SourceCode,
        };
      } else {
        return {
          isVerified: false,
          message: "Contract is not verified",
        };
      }
    } else {
      return {
        isVerified: false,
        message: `Error from explorer: ${response.data.message || "Unknown error"}`,
      };
    }
  } catch (error: any) {
    console.error(
      `    ❌ Explorer API error for ${chainName}:`,
      error.message || String(error)
    );
    return {
      isVerified: false,
      message: `Error: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Check if a contract is verified on Blockscout API (used by ZetaChain)
 */
export async function checkBlockscoutVerification(
  chainName: string,
  explorerUrl: string,
  address: string,
  apiKey: string
): Promise<VerificationStatus> {
  try {
    console.log(`    Using Blockscout API for ${chainName}`);

    // Check smart contract endpoint
    const url = `${explorerUrl}/v2/smart-contracts/${address}`;
    console.log(`    Checking verification at ${url}`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    // If we can access contract details, it's verified
    if (response.data && response.data.verified) {
      return {
        isVerified: true,
        message: "Contract is verified",
        timestamp: response.data.compiler_version || "Unknown",
        sourceCode:
          response.data.source_code?.length > 100
            ? response.data.source_code.substring(0, 100) + "..."
            : response.data.source_code,
      };
    } else {
      return {
        isVerified: false,
        message: "Contract is not verified or not found",
      };
    }
  } catch (error: any) {
    // If we get a 404, it means the contract exists but is not verified
    if (error.response && error.response.status === 404) {
      return {
        isVerified: false,
        message: "Contract exists but is not verified",
      };
    }

    console.error(
      `    ❌ Blockscout API error for ${chainName}:`,
      error.message || String(error)
    );
    return {
      isVerified: false,
      message: `Error: ${error.message || "Unknown error"}`,
    };
  }
}

/**
 * Check if a contract is verified on the appropriate explorer
 */
export async function checkContractVerification(
  chainName: string,
  explorerUrl: string,
  address: string
): Promise<VerificationStatus> {
  try {
    // Special case for Avalanche - use fixed API key "verifyContract"
    if (chainName === "avalanche") {
      console.log(
        `    Using RouteScan API for Avalanche with fixed API key "verifyContract"`
      );
      return checkEtherscanVerification(
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
      return {
        isVerified: false,
        message: "No API key environment variable defined",
      };
    }

    const apiKey = process.env[API_KEY_ENV_VARS[chainName]];

    if (!apiKey && chainName !== "avalanche") {
      console.log(
        `    ⚠️ No API key found for ${chainName} in environment variables`
      );
      return {
        isVerified: false,
        message: "No API key found in environment variables",
      };
    }

    // Use the appropriate explorer API based on chain
    if (chainName === "zetachain") {
      return checkBlockscoutVerification(
        chainName,
        explorerUrl,
        address,
        apiKey!
      );
    } else {
      return checkEtherscanVerification(
        chainName,
        explorerUrl,
        address,
        apiKey!
      );
    }
  } catch (error: any) {
    console.error(
      `    ❌ Error checking verification on ${chainName} explorer:`,
      error.message || String(error)
    );
    return {
      isVerified: false,
      message: `Error: ${error.message || "Unknown error"}`,
    };
  }
}
