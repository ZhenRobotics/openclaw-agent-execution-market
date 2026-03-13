/**
 * Simple Solver Example
 * Demonstrates how to create a basic solver agent
 */

import { AEMClient } from '../src/client/AEMClient';
import { SignatureUtils } from '../src/utils/signature';
import { Intent } from '../src/types';

class SimpleDataFetchSolver {
  private client: AEMClient;
  private sigUtils: SignatureUtils;
  private privateKey: string;
  private publicKey: string;
  private solverId?: string;

  constructor(
    clearinghouseUrl: string,
    privateKey: string
  ) {
    this.client = new AEMClient(clearinghouseUrl);
    this.sigUtils = new SignatureUtils();
    this.privateKey = privateKey;
    this.publicKey = this.sigUtils.getPublicKey(privateKey);
  }

  /**
   * Register solver with clearinghouse
   */
  async register(): Promise<void> {
    const registration = {
      publicKey: this.publicKey,
      endpoint: 'http://localhost:4000/execute',
      capabilities: ['data-fetch']
    };

    const signature = await this.sigUtils.sign(
      JSON.stringify(registration),
      this.privateKey
    );

    const solver = await this.client.registerSolver({
      ...registration,
      signature
    });

    this.solverId = solver.id;
    console.log(`Registered solver: ${this.solverId}`);
  }

  /**
   * Start listening for intents
   */
  async start(): Promise<void> {
    console.log('Solver started, listening for intents...');

    // Subscribe to intent events
    const ws = this.client.subscribeToEvents(
      ['intent.submitted', 'intent.assigned'],
      async (event) => {
        if (event.type === 'intent.submitted') {
          await this.handleNewIntent(event.data);
        }
      }
    );

    // Keep process alive
    process.on('SIGINT', () => {
      ws.close();
      process.exit(0);
    });
  }

  /**
   * Handle new intent
   */
  private async handleNewIntent(intent: Intent): Promise<void> {
    // Check if we can handle this intent
    if (intent.type !== 'data-fetch') {
      return;
    }

    console.log(`New intent received: ${intent.id}`);

    // Estimate cost and time
    const fee = 50; // Base fee
    const estimatedTime = 5000; // 5 seconds

    // Submit bid
    try {
      const bidData = {
        intentId: intent.id,
        solverId: this.solverId!,
        fee,
        estimatedTime
      };

      const signature = await this.sigUtils.sign(
        JSON.stringify(bidData),
        this.privateKey
      );

      await this.client.submitBid(
        intent.id,
        this.solverId!,
        fee,
        estimatedTime,
        signature
      );

      console.log(`Bid submitted for intent ${intent.id}`);
    } catch (error) {
      console.error('Error submitting bid:', error);
    }
  }

  /**
   * Execute an intent (called by clearinghouse)
   */
  async execute(intent: Intent): Promise<any> {
    console.log(`Executing intent ${intent.id}`);

    // Fetch data
    const response = await fetch(intent.params.url);
    const data = await response.json();

    console.log(`Intent ${intent.id} executed successfully`);

    return {
      success: true,
      data,
      timestamp: Date.now()
    };
  }
}

// Run solver
async function main() {
  const privateKey = process.env.AEM_PRIVATE_KEY;
  if (!privateKey) {
    console.error('AEM_PRIVATE_KEY environment variable required');
    process.exit(1);
  }

  const clearinghouseUrl = process.env.AEM_ENDPOINT || 'http://localhost:3000';

  const solver = new SimpleDataFetchSolver(clearinghouseUrl, privateKey);

  await solver.register();
  await solver.start();
}

main().catch(console.error);
