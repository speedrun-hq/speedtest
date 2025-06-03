import { ethers } from "ethers";

// Initiator contract interface
const initiatorAbi = [
  "function initiateAerodromeSwap(address asset, uint256 amount, uint256 tip, uint256 salt, uint256 gasLimit, address[] calldata path, bool[] calldata stableFlags, uint256 minAmountOut, uint256 deadline, address receiver) external returns (bytes32)",
  "function getNextIntentId(uint256 salt) external view returns (bytes32)",
];

export interface InitiateCallParams {
  initiatorAddress: string;
  asset: string;
  amount: bigint;
  tip: bigint;
  salt: number;
  gasLimit: number;
  path: string[];
  stableFlags: boolean[];
  minAmountOut: bigint;
  deadline: number;
  receiver: string;
}

export class CallService {
  private wallet: ethers.Wallet;

  constructor(wallet: ethers.Wallet) {
    this.wallet = wallet;
  }

  /**
   * Initiates a cross-chain call via an initiator contract
   * @returns Object containing the intentId and transaction hash
   */
  async initiateCall(
    params: InitiateCallParams,
    approveTokenCallback: (
      tokenAddress: string,
      amount: bigint
    ) => Promise<ethers.TransactionReceipt>
  ): Promise<{ intentId: string; txHash: string }> {
    // First approve the initiator contract to spend tokens
    await approveTokenCallback(params.asset, params.amount + params.tip);

    const initiatorContract = new ethers.Contract(
      params.initiatorAddress,
      initiatorAbi,
      this.wallet
    );

    // Get the intent ID before initiating the call
    const intentId = await initiatorContract.getNextIntentId(params.salt);

    console.log(`🚀 Initiating call transaction...`);
    // Execute the transaction
    const tx = await initiatorContract.initiateAerodromeSwap(
      params.asset,
      params.amount,
      params.tip,
      params.salt,
      params.gasLimit,
      params.path,
      params.stableFlags,
      params.minAmountOut,
      params.deadline,
      params.receiver
    );

    // Wait for transaction to be mined
    const receipt = await tx.wait();

    return { intentId, txHash: tx.hash };
  }
}
