/**
 * Matching Engine
 * Matches intents with capable solvers and manages bidding process
 */

import { randomUUID } from 'crypto';
import {
  Intent,
  Solver,
  Bid,
  BidStatus,
  IntentStatus,
  Event,
  EventType
} from '../types';
import { IntentManager } from '../intent/IntentManager';
import { SolverRegistry } from './SolverRegistry';
import { SignatureUtils } from '../utils/signature';

export class MatchingEngine {
  private bids: Map<string, Bid> = new Map();
  private intentBids: Map<string, Set<string>> = new Map();
  private eventHandlers: Map<EventType, Set<(event: Event) => void>> = new Map();

  constructor(
    private intentManager: IntentManager,
    private solverRegistry: SolverRegistry,
    private sigUtils: SignatureUtils,
    private bidWindowMs: number = 10000
  ) {}

  /**
   * Start matching process for an intent
   */
  async startMatching(intentId: string): Promise<void> {
    const intent = this.intentManager.getIntent(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    // Update intent status
    this.intentManager.updateIntentStatus(intentId, IntentStatus.BIDDING);

    // Find capable solvers
    const solvers = this.solverRegistry.findCapableSolvers(
      intent.type,
      intent.constraints.minReputation
    );

    if (solvers.length === 0) {
      this.intentManager.updateIntentStatus(intentId, IntentStatus.FAILED);
      throw new Error('No capable solvers found');
    }

    // Notify solvers (in real system, would send via API/WebSocket)
    console.log(`Found ${solvers.length} capable solvers for intent ${intentId}`);

    // Wait for bidding window
    await this.waitForBids(intentId);

    // Select best bid
    await this.selectBestBid(intentId);
  }

  /**
   * Submit a bid for an intent
   */
  async submitBid(
    intentId: string,
    solverId: string,
    fee: number,
    estimatedTime: number,
    signature: string
  ): Promise<Bid> {
    const intent = this.intentManager.getIntent(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    if (intent.status !== IntentStatus.BIDDING) {
      throw new Error(`Intent ${intentId} is not accepting bids`);
    }

    const solver = this.solverRegistry.getSolver(solverId);
    if (!solver) {
      throw new Error(`Solver ${solverId} not found`);
    }

    // Verify bid signature
    const bidData = { intentId, solverId, fee, estimatedTime };
    const isValid = await this.sigUtils.verify(
      JSON.stringify(bidData),
      signature,
      solver.publicKey
    );

    if (!isValid) {
      throw new Error('Invalid bid signature');
    }

    // Validate bid constraints
    if (fee > intent.constraints.maxFee) {
      throw new Error(`Bid fee ${fee} exceeds max fee ${intent.constraints.maxFee}`);
    }

    // Create bid
    const bid: Bid = {
      id: randomUUID(),
      intentId,
      solverId,
      fee,
      estimatedTime,
      signature,
      timestamp: Date.now(),
      status: BidStatus.SUBMITTED
    };

    // Store bid
    this.bids.set(bid.id, bid);

    // Index by intent
    if (!this.intentBids.has(intentId)) {
      this.intentBids.set(intentId, new Set());
    }
    this.intentBids.get(intentId)!.add(bid.id);

    // Emit event
    this.emitEvent({
      id: randomUUID(),
      type: EventType.BID_SUBMITTED,
      data: bid,
      timestamp: Date.now()
    });

    return bid;
  }

  /**
   * Get bids for an intent
   */
  getBidsForIntent(intentId: string): Bid[] {
    const bidIds = this.intentBids.get(intentId);
    if (!bidIds) {
      return [];
    }

    return Array.from(bidIds)
      .map(id => this.bids.get(id))
      .filter((b): b is Bid => b !== undefined);
  }

  /**
   * Wait for bidding window
   */
  private async waitForBids(intentId: string): Promise<void> {
    return new Promise(resolve => {
      setTimeout(() => resolve(), this.bidWindowMs);
    });
  }

  /**
   * Select best bid for an intent
   */
  private async selectBestBid(intentId: string): Promise<void> {
    const bids = this.getBidsForIntent(intentId);

    if (bids.length === 0) {
      this.intentManager.updateIntentStatus(intentId, IntentStatus.FAILED);
      return;
    }

    // Score each bid
    const scoredBids = bids.map(bid => ({
      bid,
      score: this.scoreBid(bid)
    }));

    // Sort by score (descending)
    scoredBids.sort((a, b) => b.score - a.score);

    // Select winner
    const winner = scoredBids[0].bid;
    winner.status = BidStatus.SELECTED;

    // Reject others
    scoredBids.slice(1).forEach(({ bid }) => {
      bid.status = BidStatus.REJECTED;
    });

    // Update intent
    this.intentManager.updateIntentStatus(intentId, IntentStatus.ASSIGNED);

    // Emit event
    this.emitEvent({
      id: randomUUID(),
      type: EventType.BID_SELECTED,
      data: { intentId, bid: winner },
      timestamp: Date.now()
    });

    console.log(`Selected bid ${winner.id} from solver ${winner.solverId} for intent ${intentId}`);
  }

  /**
   * Score a bid based on multiple factors
   */
  private scoreBid(bid: Bid): number {
    const solver = this.solverRegistry.getSolver(bid.solverId);
    if (!solver) {
      return 0;
    }

    // Factors:
    // - Solver reputation (40%)
    // - Bid fee (30%, lower is better)
    // - Estimated time (20%, faster is better)
    // - Solver response time history (10%)

    const reputationScore = solver.reputation;

    // Normalize fee (assuming max fee of 1000)
    const feeScore = Math.max(0, 1 - bid.fee / 1000);

    // Normalize estimated time (assuming max time of 60000ms)
    const timeScore = Math.max(0, 1 - bid.estimatedTime / 60000);

    // Solver avg response time score
    const responseScore = Math.max(0, 1 - solver.metadata.avgResponseTime / 30000);

    return (
      reputationScore * 0.4 +
      feeScore * 0.3 +
      timeScore * 0.2 +
      responseScore * 0.1
    );
  }

  /**
   * Get selected bid for an intent
   */
  getSelectedBid(intentId: string): Bid | undefined {
    const bids = this.getBidsForIntent(intentId);
    return bids.find(b => b.status === BidStatus.SELECTED);
  }

  /**
   * Subscribe to events
   */
  on(eventType: EventType, handler: (event: Event) => void): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  /**
   * Emit event to subscribers
   */
  private emitEvent(event: Event): void {
    this.eventHandlers.get(event.type)?.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Event handler error:', error);
      }
    });
  }
}
