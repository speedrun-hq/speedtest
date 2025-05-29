import axios from 'axios';
import { SPEEDRUN_API_URL } from '../constants';

export interface IntentResponse {
  id: string;
  source_chain: string;
  destination_chain: string;
  token: string;
  amount: string;
  recipient: string;
  intent_fee: string;
  status: 'pending' | 'fulfilled' | 'settled' | 'cancelled' | 'failed';
  created_at: string;
  updated_at: string;
  fulfillment_tx?: string;
  settlement_tx?: string;
}

export class SpeedrunApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = SPEEDRUN_API_URL;
  }

  /**
   * Fetch intent details from the Speedrun API
   * @param intentId The intent ID to query (bytes32 string)
   * @returns Intent details or null if not found
   */
  async getIntent(intentId: string): Promise<IntentResponse | null> {
    try {
      const response = await axios.get<IntentResponse>(`${this.baseUrl}/intents/${intentId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Polls the API until the intent reaches the desired status or max attempts is reached
   * @param intentId The intent ID to poll
   * @param targetStatus The status to wait for
   * @param maxAttempts Maximum number of polling attempts
   * @param intervalMs Interval between polling attempts in milliseconds
   * @returns The intent data when the target status is reached, or the latest data if max attempts reached
   */
  async pollIntentStatus(
    intentId: string,
    targetStatus: IntentResponse['status'] | IntentResponse['status'][],
    maxAttempts: number,
    intervalMs: number
  ): Promise<IntentResponse | null> {
    const targetStatuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];
    
    let attempts = 0;
    while (attempts < maxAttempts) {
      const intent = await this.getIntent(intentId);
      
      if (!intent) {
        console.log(`Intent ${intentId} not found.`);
        return null;
      }
      
      console.log(`Intent ${intentId} status: ${intent.status} (attempt ${attempts + 1}/${maxAttempts})`);
      
      if (targetStatuses.includes(intent.status)) {
        return intent;
      }
      
      // Wait for the specified interval
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      attempts++;
    }
    
    // Return the latest intent data even if target status wasn't reached
    return this.getIntent(intentId);
  }
}
