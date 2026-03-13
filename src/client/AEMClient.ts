/**
 * Agent Execution Market Client SDK
 * JavaScript/TypeScript client for interacting with the clearinghouse
 */

import {
  Intent,
  Solver,
  IntentSubmission,
  SolverRegistration,
  APIResponse
} from '../types';

export class AEMClient {
  constructor(private endpoint: string) {}

  /**
   * Submit an intent
   */
  async submitIntent(
    intent: IntentSubmission,
    publicKey: string,
    signature: string
  ): Promise<Intent> {
    const response = await this.post('/api/intents', {
      intent,
      publicKey,
      signature
    });

    return response.data;
  }

  /**
   * List intents
   */
  async listIntents(filters?: {
    status?: string;
    type?: string;
    submitter?: string;
  }): Promise<Intent[]> {
    const query = new URLSearchParams(filters as any).toString();
    const response = await this.get(`/api/intents?${query}`);

    return response.data;
  }

  /**
   * Get intent by ID
   */
  async getIntent(intentId: string): Promise<Intent> {
    const response = await this.get(`/api/intents/${intentId}`);

    return response.data;
  }

  /**
   * Cancel an intent
   */
  async cancelIntent(
    intentId: string,
    publicKey: string,
    signature: string
  ): Promise<void> {
    await this.post(`/api/intents/${intentId}/cancel`, {
      publicKey,
      signature
    });
  }

  /**
   * Register a solver
   */
  async registerSolver(registration: SolverRegistration): Promise<Solver> {
    const response = await this.post('/api/solvers/register', registration);

    return response.data;
  }

  /**
   * List solvers
   */
  async listSolvers(): Promise<Solver[]> {
    const response = await this.get('/api/solvers');

    return response.data;
  }

  /**
   * Get solver by ID
   */
  async getSolver(solverId: string): Promise<Solver> {
    const response = await this.get(`/api/solvers/${solverId}`);

    return response.data;
  }

  /**
   * Send solver heartbeat
   */
  async solverHeartbeat(solverId: string): Promise<void> {
    await this.post(`/api/solvers/${solverId}/heartbeat`, {});
  }

  /**
   * Submit a bid
   */
  async submitBid(
    intentId: string,
    solverId: string,
    fee: number,
    estimatedTime: number,
    signature: string
  ): Promise<any> {
    const response = await this.post('/api/bids', {
      intentId,
      solverId,
      fee,
      estimatedTime,
      signature
    });

    return response.data;
  }

  /**
   * Get bids for an intent
   */
  async getIntentBids(intentId: string): Promise<any[]> {
    const response = await this.get(`/api/intents/${intentId}/bids`);

    return response.data;
  }

  /**
   * Get market statistics
   */
  async getMarketStats(): Promise<any> {
    const response = await this.get('/api/market/stats');

    return response.data;
  }

  /**
   * Subscribe to events via WebSocket
   */
  subscribeToEvents(events: string[], handler: (event: any) => void): WebSocket {
    const wsUrl = this.endpoint.replace('http', 'ws');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', events }));
    };

    ws.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data);
        if (data.type === 'event') {
          handler(data.event);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    return ws;
  }

  // HTTP helpers

  private async get(path: string): Promise<APIResponse> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json() as APIResponse;

    if (!data.success) {
      throw new Error(data.error?.message || 'Request failed');
    }

    return data;
  }

  private async post(path: string, body: any): Promise<APIResponse> {
    const response = await fetch(`${this.endpoint}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json() as APIResponse;

    if (!data.success) {
      throw new Error(data.error?.message || 'Request failed');
    }

    return data;
  }
}
