/**
 * Execution Verifier
 * Verifies execution proofs and state transitions
 */

import { randomUUID } from 'crypto';
import {
  ExecutionProof,
  VerificationResult,
  VerificationCheck,
  Intent,
  Solver,
  Event,
  EventType
} from '../types';
import { SignatureUtils } from '../utils/signature';
import { HashUtils } from '../utils/hash';

export class Verifier {
  private eventHandlers: Map<EventType, Set<(event: Event) => void>> = new Map();

  constructor(
    private sigUtils: SignatureUtils,
    private hashUtils: HashUtils
  ) {}

  /**
   * Verify execution proof
   */
  async verifyExecutionProof(
    proof: ExecutionProof,
    intent: Intent,
    solver: Solver,
    result: any
  ): Promise<VerificationResult> {
    const checks: VerificationCheck[] = [];

    // 1. Verify signature
    const signatureCheck = await this.verifySignature(proof, solver);
    checks.push(signatureCheck);

    // 2. Verify result hash
    const resultHashCheck = this.verifyResultHash(proof, result);
    checks.push(resultHashCheck);

    // 3. Verify state transition
    const stateTransitionCheck = this.verifyStateTransition(proof);
    checks.push(stateTransitionCheck);

    // 4. Verify timestamp
    const timestampCheck = this.verifyTimestamp(proof, intent);
    checks.push(timestampCheck);

    // 5. Verify merkle proof (if provided)
    if (proof.merkleProof) {
      const merkleCheck = this.verifyMerkleProof(proof);
      checks.push(merkleCheck);
    }

    // Aggregate result
    const allPassed = checks.every(c => c.passed);

    const verificationResult: VerificationResult = {
      valid: allPassed,
      proofId: randomUUID(),
      checks,
      timestamp: Date.now()
    };

    // Emit event
    this.emitEvent({
      id: randomUUID(),
      type: allPassed
        ? EventType.VERIFICATION_COMPLETED
        : EventType.VERIFICATION_FAILED,
      data: verificationResult,
      timestamp: Date.now()
    });

    return verificationResult;
  }

  /**
   * Verify proof signature
   */
  private async verifySignature(
    proof: ExecutionProof,
    solver: Solver
  ): Promise<VerificationCheck> {
    try {
      const message = JSON.stringify({
        intentId: proof.intentId,
        solverId: proof.solverId,
        preStateHash: proof.preStateHash,
        postStateHash: proof.postStateHash,
        resultHash: proof.resultHash,
        timestamp: proof.timestamp,
        merkleRoot: proof.merkleRoot
      });

      const isValid = await this.sigUtils.verify(
        message,
        proof.signature,
        solver.publicKey
      );

      return {
        type: 'signature',
        passed: isValid,
        details: isValid ? 'Signature valid' : 'Invalid signature'
      };
    } catch (error) {
      return {
        type: 'signature',
        passed: false,
        details: `Signature verification error: ${error}`
      };
    }
  }

  /**
   * Verify result hash matches
   */
  private verifyResultHash(
    proof: ExecutionProof,
    result: any
  ): VerificationCheck {
    try {
      const computedHash = this.hashUtils.hash(JSON.stringify(result));
      const matches = computedHash === proof.resultHash;

      return {
        type: 'result-hash',
        passed: matches,
        details: matches
          ? 'Result hash matches'
          : `Hash mismatch: expected ${proof.resultHash}, got ${computedHash}`
      };
    } catch (error) {
      return {
        type: 'result-hash',
        passed: false,
        details: `Hash verification error: ${error}`
      };
    }
  }

  /**
   * Verify state transition is valid
   */
  private verifyStateTransition(proof: ExecutionProof): VerificationCheck {
    // In a real system, this would verify that the state transition
    // from preStateHash to postStateHash is valid given the execution
    // For now, just check that hashes are present and different

    const hasPreState = !!(proof.preStateHash && proof.preStateHash.length > 0);
    const hasPostState = !!(proof.postStateHash && proof.postStateHash.length > 0);
    const statesAreDifferent = proof.preStateHash !== proof.postStateHash;

    const valid = hasPreState && hasPostState && statesAreDifferent;

    return {
      type: 'state-transition',
      passed: valid,
      details: valid
        ? 'State transition valid'
        : 'Invalid state transition: missing or identical hashes'
    };
  }

  /**
   * Verify proof timestamp is reasonable
   */
  private verifyTimestamp(
    proof: ExecutionProof,
    intent: Intent
  ): VerificationCheck {
    // Check that proof timestamp is:
    // 1. After intent submission
    // 2. Before deadline
    // 3. Not in the future

    const now = Date.now();
    const afterSubmission = proof.timestamp >= intent.timestamp;
    const beforeDeadline = proof.timestamp <= intent.constraints.deadline;
    const notInFuture = proof.timestamp <= now + 5000; // 5s tolerance

    const valid = afterSubmission && beforeDeadline && notInFuture;

    return {
      type: 'timestamp',
      passed: valid,
      details: valid
        ? 'Timestamp valid'
        : `Invalid timestamp: ${proof.timestamp} (intent: ${intent.timestamp}, deadline: ${intent.constraints.deadline}, now: ${now})`
    };
  }

  /**
   * Verify merkle proof
   */
  private verifyMerkleProof(proof: ExecutionProof): VerificationCheck {
    // Simplified merkle proof verification
    // In a real system, would verify the full merkle path

    const hasRoot = !!(proof.merkleRoot && proof.merkleRoot.length > 0);
    const hasProof = !!(proof.merkleProof && proof.merkleProof.length > 0);

    const valid = hasRoot && hasProof;

    return {
      type: 'merkle-proof',
      passed: valid,
      details: valid
        ? 'Merkle proof valid'
        : 'Invalid merkle proof: missing root or proof'
    };
  }

  /**
   * Generate execution proof
   */
  async generateExecutionProof(
    intentId: string,
    solverId: string,
    preState: any,
    postState: any,
    result: any,
    solverPrivateKey: string
  ): Promise<ExecutionProof> {
    const preStateHash = this.hashUtils.hash(JSON.stringify(preState));
    const postStateHash = this.hashUtils.hash(JSON.stringify(postState));
    const resultHash = this.hashUtils.hash(JSON.stringify(result));
    const timestamp = Date.now();

    // Generate merkle root (simplified - just hash of all hashes)
    const merkleRoot = this.hashUtils.hash(
      `${preStateHash}${postStateHash}${resultHash}${timestamp}`
    );

    // Sign the proof
    const message = JSON.stringify({
      intentId,
      solverId,
      preStateHash,
      postStateHash,
      resultHash,
      timestamp,
      merkleRoot
    });

    const signature = await this.sigUtils.sign(message, solverPrivateKey);

    return {
      intentId,
      solverId,
      preStateHash,
      postStateHash,
      resultHash,
      signature,
      timestamp,
      merkleRoot
    };
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
