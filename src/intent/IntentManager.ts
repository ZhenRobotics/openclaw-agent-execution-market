/**
 * Intent Management System
 * Handles intent submission, validation, and lifecycle management
 */

import { randomUUID } from 'crypto';
import {
  Intent,
  IntentSubmission,
  IntentStatus,
  IntentConstraints,
  Event,
  EventType
} from '../types';
import { SignatureUtils } from '../utils/signature';
import { HashUtils } from '../utils/hash';

export class IntentManager {
  private intents: Map<string, Intent> = new Map();
  private eventHandlers: Map<EventType, Set<(event: Event) => void>> = new Map();

  constructor(private sigUtils: SignatureUtils) {}

  /**
   * Submit a new intent
   */
  async submitIntent(
    submission: IntentSubmission,
    submitterPublicKey: string,
    signature: string
  ): Promise<Intent> {
    // Validate intent submission
    this.validateSubmission(submission);

    // Verify signature
    const message = JSON.stringify(submission);
    const isValid = await this.sigUtils.verify(
      message,
      signature,
      submitterPublicKey
    );

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Create intent
    const intent: Intent = {
      id: randomUUID(),
      version: '1.0.0',
      type: submission.type,
      params: submission.params,
      constraints: this.normalizeConstraints(submission.constraints),
      signature,
      submitter: submitterPublicKey,
      timestamp: Date.now(),
      status: IntentStatus.PENDING
    };

    // Store intent
    this.intents.set(intent.id, intent);

    // Emit event
    this.emitEvent({
      id: randomUUID(),
      type: EventType.INTENT_SUBMITTED,
      data: intent,
      timestamp: Date.now()
    });

    return intent;
  }

  /**
   * Get intent by ID
   */
  getIntent(intentId: string): Intent | undefined {
    return this.intents.get(intentId);
  }

  /**
   * List intents with filters
   */
  listIntents(filters?: {
    status?: IntentStatus;
    type?: string;
    submitter?: string;
  }): Intent[] {
    let result = Array.from(this.intents.values());

    if (filters?.status) {
      result = result.filter(i => i.status === filters.status);
    }

    if (filters?.type) {
      result = result.filter(i => i.type === filters.type);
    }

    if (filters?.submitter) {
      result = result.filter(i => i.submitter === filters.submitter);
    }

    return result.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Update intent status
   */
  updateIntentStatus(intentId: string, status: IntentStatus): void {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    intent.status = status;

    // Emit status change event
    let eventType: EventType;
    switch (status) {
      case IntentStatus.ASSIGNED:
        eventType = EventType.INTENT_ASSIGNED;
        break;
      case IntentStatus.COMPLETED:
        eventType = EventType.INTENT_COMPLETED;
        break;
      case IntentStatus.FAILED:
        eventType = EventType.INTENT_FAILED;
        break;
      default:
        return;
    }

    this.emitEvent({
      id: randomUUID(),
      type: eventType,
      data: intent,
      timestamp: Date.now()
    });
  }

  /**
   * Cancel an intent
   */
  async cancelIntent(
    intentId: string,
    submitterPublicKey: string,
    signature: string
  ): Promise<void> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent ${intentId} not found`);
    }

    // Verify requester is the submitter
    if (intent.submitter !== submitterPublicKey) {
      throw new Error('Only submitter can cancel intent');
    }

    // Verify signature
    const isValid = await this.sigUtils.verify(
      intentId,
      signature,
      submitterPublicKey
    );

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Can only cancel pending or bidding intents
    if (![IntentStatus.PENDING, IntentStatus.BIDDING].includes(intent.status)) {
      throw new Error(`Cannot cancel intent in ${intent.status} status`);
    }

    this.updateIntentStatus(intentId, IntentStatus.CANCELLED);
  }

  /**
   * Check if intent is expired
   */
  isExpired(intent: Intent): boolean {
    return Date.now() > intent.constraints.deadline;
  }

  /**
   * Clean up expired intents
   */
  cleanupExpiredIntents(): void {
    for (const [id, intent] of this.intents.entries()) {
      if (
        this.isExpired(intent) &&
        [IntentStatus.PENDING, IntentStatus.BIDDING].includes(intent.status)
      ) {
        this.updateIntentStatus(id, IntentStatus.FAILED);
      }
    }
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
   * Unsubscribe from events
   */
  off(eventType: EventType, handler: (event: Event) => void): void {
    this.eventHandlers.get(eventType)?.delete(handler);
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

  /**
   * Validate intent submission
   */
  private validateSubmission(submission: IntentSubmission): void {
    if (!submission.type || typeof submission.type !== 'string') {
      throw new Error('Intent type is required');
    }

    if (!submission.params || typeof submission.params !== 'object') {
      throw new Error('Intent params are required');
    }

    if (!submission.constraints) {
      throw new Error('Intent constraints are required');
    }

    const { maxFee, deadline } = submission.constraints;

    if (typeof maxFee !== 'number' || maxFee <= 0) {
      throw new Error('Valid maxFee is required');
    }

    if (typeof deadline !== 'number' || deadline <= Date.now()) {
      throw new Error('Valid future deadline is required');
    }
  }

  /**
   * Normalize constraints with defaults
   */
  private normalizeConstraints(
    constraints: IntentConstraints
  ): IntentConstraints {
    return {
      ...constraints,
      minReputation: constraints.minReputation ?? 0,
      preferredSolvers: constraints.preferredSolvers ?? [],
      requireProof: constraints.requireProof ?? true
    };
  }
}
