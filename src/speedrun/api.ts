import axios from "axios";
import { SPEEDRUN_API_URL } from "../constants";

export interface IntentResponse {
  id: string;
  source_chain: string;
  destination_chain: string;
  token: string;
  amount: string;
  recipient: string;
  intent_fee: string;
  status: "pending" | "fulfilled" | "settled" | "cancelled" | "failed";
  created_at: string;
  updated_at: string;
  fulfillment_tx?: string;
  settlement_tx?: string;
}

export interface IntentStatusResult {
  intent: IntentResponse | null;
  fulfilledAt?: Date;
  settledAt?: Date;
  timeToFulfill?: number; // milliseconds
  timeToSettle?: number; // milliseconds from fulfilled to settled
  totalTime?: number; // milliseconds from start to settled
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
      const response = await axios.get<IntentResponse>(
        `${this.baseUrl}/intents/${intentId}`
      );
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
   * @returns Object containing the final intent and timing information
   */
  async pollIntentStatus(
    intentId: string,
    targetStatus: IntentResponse["status"] | IntentResponse["status"][],
    maxAttempts: number,
    intervalMs: number
  ): Promise<IntentStatusResult> {
    const targetStatuses = Array.isArray(targetStatus)
      ? targetStatus
      : [targetStatus];

    let attempts = 0;
    let intent: IntentResponse | null = null;
    let previousStatus: string | null = null;
    let intentFound = false;
    const startTime = new Date();
    let fulfilledAt: Date | undefined;
    let settledAt: Date | undefined;

    // Maximum attempts to wait for intent to be found in API
    const MAX_NOT_FOUND_ATTEMPTS = 5;
    let notFoundAttempts = 0;

    while (attempts < maxAttempts) {
      intent = await this.getIntent(intentId);
      attempts++;

      if (!intent) {
        notFoundAttempts++;
        if (notFoundAttempts >= MAX_NOT_FOUND_ATTEMPTS) {
          throw new Error(
            `Intent not found in API after ${MAX_NOT_FOUND_ATTEMPTS} attempts`
          );
        }
      } else {
        // Only log when we first find the intent or when status changes
        if (!intentFound) {
          console.log(`⏳ Intent found in API with status: ${intent.status}`);
          intentFound = true;
        }

        // Record status changes and log them
        if (intent.status !== previousStatus && intentFound) {
          previousStatus = intent.status;

          // Record and log fulfilled status
          if (intent.status === "fulfilled") {
            fulfilledAt = new Date();
            console.log(`👌 Intent fulfilled!`);
          }

          // Record settled status
          if (intent.status === "settled") {
            settledAt = new Date();
          }
        }

        // If we've reached the final target status (settled), we can stop polling
        // But for fulfilled, we want to continue polling until settled or max attempts
        if (
          targetStatuses.includes(intent.status) &&
          intent.status !== "fulfilled"
        ) {
          break;
        }
      }

      // Wait for the specified interval before trying again
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    // Calculate timing metrics if available
    const result: IntentStatusResult = { intent };

    if (fulfilledAt) {
      result.fulfilledAt = fulfilledAt;
      result.timeToFulfill = fulfilledAt.getTime() - startTime.getTime();
    }

    if (settledAt && fulfilledAt) {
      result.settledAt = settledAt;
      result.timeToSettle = settledAt.getTime() - fulfilledAt.getTime();
      result.totalTime = settledAt.getTime() - startTime.getTime();
    }

    return result;
  }
}
