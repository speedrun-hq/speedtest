import { ethers } from "ethers";

// Intent contract interface for transfers
const transferIntentAbi = [
  "function initiateTransfer(address asset, uint256 amount, uint256 targetChain, bytes calldata receiver, uint256 tip, uint256 salt) external returns (bytes32)",
  "function getNextIntentId(uint256 salt) external view returns (bytes32)",
];

export interface InitiateTransferParams {
  asset: string;
  amount: bigint;
  targetChain: number;
  receiver: string;
  tip: bigint;
  salt: number;
}

export class TransferService {
  private wallet: ethers.Wallet;
  private intentContractAddress: string;

  constructor(wallet: ethers.Wallet, intentContractAddress: string) {
    this.wallet = wallet;
    this.intentContractAddress = intentContractAddress;
  }

  /**
   * Initiates a cross-chain token transfer
   * @returns Object containing the intentId and transaction hash
   */
  async initiateTransfer(
    params: InitiateTransferParams,
    approveTokenCallback: (
      tokenAddress: string,
      amount: bigint
    ) => Promise<ethers.TransactionReceipt>
  ): Promise<{ intentId: string; txHash: string }> {
    // First approve the intent contract to spend tokens
    await approveTokenCallback(params.asset, params.amount + params.tip);

    const intentContract = new ethers.Contract(
      this.intentContractAddress,
      transferIntentAbi,
      this.wallet
    );

    // Get the intent ID before initiating the transfer
    const intentId = await intentContract.getNextIntentId(params.salt);

    // Encode the receiver as bytes
    const receiverBytes = ethers.getBytes(
      ethers.zeroPadValue(params.receiver, 20)
    );

    console.log(`🚀 Initiating transfer transaction...`);
    // Execute the transaction
    const tx = await intentContract.initiateTransfer(
      params.asset,
      params.amount,
      params.targetChain,
      receiverBytes,
      params.tip,
      params.salt
    );

    // Wait for transaction to be mined
    const receipt = await tx.wait();

    return { intentId, txHash: tx.hash };
  }
}
