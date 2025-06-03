import { ethers } from "ethers";
import { ChainConfig } from "../constants";
import { TransferService, InitiateTransferParams } from "./transfer";
import { CallService, InitiateCallParams } from "./call";

// ERC20 token interface
const erc20Abi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export { InitiateTransferParams } from "./transfer";
export { InitiateCallParams } from "./call";

export class EvmClient {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private chainConfig: ChainConfig;
  private transferService: TransferService;
  private callService: CallService;

  constructor(chainConfig: ChainConfig, privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(chainConfig.rpc);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.chainConfig = chainConfig;
    this.transferService = new TransferService(this.wallet, chainConfig.intent);
    this.callService = new CallService(this.wallet);
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
   * Approves a contract to spend tokens
   * @param tokenAddress The token to approve
   * @param amount The amount to approve
   * @param spender The address of the contract to approve (defaults to intent contract)
   * @returns Transaction receipt of the approval
   */
  async approveToken(
    tokenAddress: string,
    amount: bigint,
    spender?: string
  ): Promise<ethers.TransactionReceipt> {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      erc20Abi,
      this.wallet
    );

    // Use specified spender or default to intent contract
    const spenderAddress = spender || this.chainConfig.intent;

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(
      this.wallet.address,
      spenderAddress
    );

    // If allowance is already sufficient, return early
    if (currentAllowance >= amount) {
      console.log(
        `✅ Approval already exists for ${ethers.formatUnits(currentAllowance)} tokens`
      );
      // Return a dummy receipt since we don't need to make a transaction
      return {} as ethers.TransactionReceipt;
    }

    console.log(`🔓 Approving ${spenderAddress} to spend tokens...`);
    const tx = await tokenContract.approve(spenderAddress, amount);
    const receipt = await tx.wait();

    console.log(`✅ Approval transaction confirmed: ${receipt?.hash}`);
    return receipt;
  }

  /**
   * Initiates a cross-chain token transfer
   * @returns Object containing the intentId and transaction hash
   */
  async initiateTransfer(
    params: InitiateTransferParams
  ): Promise<{ intentId: string; txHash: string }> {
    return this.transferService.initiateTransfer(
      params,
      (tokenAddress, amount) => this.approveToken(tokenAddress, amount)
    );
  }

  /**
   * Initiates a cross-chain call via an initiator contract
   * @returns Object containing the intentId and transaction hash
   */
  async initiateCall(
    params: InitiateCallParams
  ): Promise<{ intentId: string; txHash: string }> {
    return this.callService.initiateCall(params, (tokenAddress, amount) =>
      this.approveToken(tokenAddress, amount, params.initiatorAddress)
    );
  }

  async checkFunds(address: string, tokenAddress: string): Promise<string> {
    return this.getTokenBalance(tokenAddress, address);
  }
}
