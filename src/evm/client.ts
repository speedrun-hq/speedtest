import { ethers } from "ethers";
import { ChainConfig } from "../constants";

// Intent contract interface
const intentAbi = [
  "function initiateTransfer(address asset, uint256 amount, uint256 targetChain, bytes calldata receiver, uint256 tip, uint256 salt) external returns (bytes32)",
];

// ERC20 token interface
const erc20Abi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export interface InitiateTransferParams {
  asset: string;
  amount: bigint;
  targetChain: number;
  receiver: string;
  tip: bigint;
  salt: number;
}

export class EvmClient {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private chainConfig: ChainConfig;

  constructor(chainConfig: ChainConfig, privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(chainConfig.rpc);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.chainConfig = chainConfig;
  }

  async getBalance(address?: string): Promise<string> {
    const targetAddress = address || this.wallet.address;
    const balance = await this.provider.getBalance(targetAddress);
    return ethers.formatEther(balance);
  }

  async getTokenBalance(
    tokenAddress: string,
    address?: string
  ): Promise<string> {
    const targetAddress = address || this.wallet.address;
    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20Abi,
      this.provider
    );
    const balance = await tokenContract.balanceOf(targetAddress);
    const decimals = await tokenContract.decimals();

    return ethers.formatUnits(balance, decimals);
  }

  /**
   * Approves the intent contract to spend tokens
   * @param tokenAddress The token to approve
   * @param amount The amount to approve
   * @returns Transaction receipt of the approval
   */
  async approveToken(
    tokenAddress: string,
    amount: bigint
  ): Promise<ethers.TransactionReceipt> {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20Abi,
      this.wallet
    );

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(
      this.wallet.address,
      this.chainConfig.intent
    );

    // If allowance is already sufficient, return early
    if (currentAllowance >= amount) {
      console.log(
        `Approval already exists for ${ethers.formatUnits(currentAllowance)} tokens`
      );
      // Return a dummy receipt since we don't need to make a transaction
      return {} as ethers.TransactionReceipt;
    }

    console.log(`Approving intent contract to spend tokens...`);
    const tx = await tokenContract.approve(this.chainConfig.intent, amount);
    const receipt = await tx.wait();

    console.log(`Approval transaction confirmed: ${receipt?.hash}`);
    return receipt;
  }

  /**
   * Initiates a cross-chain token transfer
   * @returns intentId as bytes32 string
   */
  async initiateTransfer(params: InitiateTransferParams): Promise<string> {
    // First approve the intent contract to spend tokens
    await this.approveToken(params.asset, params.amount + params.tip);

    const intentContract = new ethers.Contract(
      this.chainConfig.intent,
      intentAbi,
      this.wallet
    );

    // Encode the receiver as bytes
    const receiverBytes = ethers.getBytes(
      ethers.zeroPadValue(params.receiver, 20)
    );

    console.log(`Initiating transfer transaction...`);
    // Execute the transaction
    const tx = await intentContract.initiateTransfer(
      params.asset,
      params.amount,
      params.targetChain,
      receiverBytes,
      params.tip,
      params.salt
    );

    console.log(`Transaction sent: ${tx.hash}`);
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt?.blockNumber}`);

    // Extract the intent ID from transaction logs
    // This assumes the intent ID is emitted as the first topic in the first log
    if (receipt && receipt.logs.length > 0) {
      const intentId = receipt.logs[0].topics[1];
      return intentId;
    } else {
      throw new Error("Failed to extract intent ID from transaction");
    }
  }

  async checkFunds(address: string, tokenAddress: string): Promise<string> {
    return this.getTokenBalance(tokenAddress, address);
  }
}
