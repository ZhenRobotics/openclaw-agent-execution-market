/**
 * Solver Registry
 * Manages solver registration, capabilities, and lifecycle
 */

import { randomUUID } from 'crypto';
import {
  Solver,
  SolverRegistration,
  SolverStatus,
  SolverMetadata,
  Event,
  EventType
} from '../types';
import { SignatureUtils } from '../utils/signature';

export class SolverRegistry {
  private solvers: Map<string, Solver> = new Map();
  private capabilityIndex: Map<string, Set<string>> = new Map();
  private eventHandlers: Map<EventType, Set<(event: Event) => void>> = new Map();

  constructor(private sigUtils: SignatureUtils) {}

  /**
   * Register a new solver
   */
  async registerSolver(registration: SolverRegistration): Promise<Solver> {
    // Verify signature
    const message = JSON.stringify({
      publicKey: registration.publicKey,
      endpoint: registration.endpoint,
      capabilities: registration.capabilities
    });

    const isValid = await this.sigUtils.verify(
      message,
      registration.signature,
      registration.publicKey
    );

    if (!isValid) {
      throw new Error('Invalid registration signature');
    }

    // Check if already registered
    const existingSolver = this.findByPublicKey(registration.publicKey);
    if (existingSolver) {
      throw new Error('Solver already registered');
    }

    // Create solver
    const solver: Solver = {
      id: randomUUID(),
      publicKey: registration.publicKey,
      endpoint: registration.endpoint,
      capabilities: registration.capabilities,
      reputation: 0.5, // Starting reputation
      status: SolverStatus.ACTIVE,
      metadata: {
        maxConcurrent: registration.metadata?.maxConcurrent ?? 5,
        avgResponseTime: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        ...registration.metadata
      },
      registeredAt: Date.now(),
      lastSeen: Date.now()
    };

    // Store solver
    this.solvers.set(solver.id, solver);

    // Index capabilities
    for (const capability of solver.capabilities) {
      if (!this.capabilityIndex.has(capability)) {
        this.capabilityIndex.set(capability, new Set());
      }
      this.capabilityIndex.get(capability)!.add(solver.id);
    }

    // Emit event
    this.emitEvent({
      id: randomUUID(),
      type: EventType.SOLVER_REGISTERED,
      data: solver,
      timestamp: Date.now()
    });

    return solver;
  }

  /**
   * Get solver by ID
   */
  getSolver(solverId: string): Solver | undefined {
    return this.solvers.get(solverId);
  }

  /**
   * Find solver by public key
   */
  findByPublicKey(publicKey: string): Solver | undefined {
    return Array.from(this.solvers.values()).find(
      s => s.publicKey === publicKey
    );
  }

  /**
   * Find solvers by capability
   */
  findByCapability(capability: string): Solver[] {
    const solverIds = this.capabilityIndex.get(capability);
    if (!solverIds) {
      return [];
    }

    return Array.from(solverIds)
      .map(id => this.solvers.get(id))
      .filter((s): s is Solver => s !== undefined);
  }

  /**
   * Find capable solvers for an intent type
   */
  findCapableSolvers(
    intentType: string,
    minReputation?: number
  ): Solver[] {
    let solvers = this.findByCapability(intentType);

    // Filter by status
    solvers = solvers.filter(
      s => s.status === SolverStatus.ACTIVE || s.status === SolverStatus.BUSY
    );

    // Filter by reputation
    if (minReputation !== undefined) {
      solvers = solvers.filter(s => s.reputation >= minReputation);
    }

    // Sort by reputation (descending)
    return solvers.sort((a, b) => b.reputation - a.reputation);
  }

  /**
   * Update solver status
   */
  updateStatus(solverId: string, status: SolverStatus): void {
    const solver = this.solvers.get(solverId);
    if (!solver) {
      throw new Error(`Solver ${solverId} not found`);
    }

    solver.status = status;
    solver.lastSeen = Date.now();

    if (status === SolverStatus.OFFLINE) {
      this.emitEvent({
        id: randomUUID(),
        type: EventType.SOLVER_OFFLINE,
        data: solver,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Update solver metadata
   */
  updateMetadata(
    solverId: string,
    metadata: Partial<SolverMetadata>
  ): void {
    const solver = this.solvers.get(solverId);
    if (!solver) {
      throw new Error(`Solver ${solverId} not found`);
    }

    solver.metadata = { ...solver.metadata, ...metadata };
    solver.lastSeen = Date.now();

    this.emitEvent({
      id: randomUUID(),
      type: EventType.SOLVER_UPDATED,
      data: solver,
      timestamp: Date.now()
    });
  }

  /**
   * Record execution result and update reputation
   */
  recordExecution(solverId: string, success: boolean, executionTime: number): void {
    const solver = this.solvers.get(solverId);
    if (!solver) {
      return;
    }

    // Update metadata
    solver.metadata.totalExecutions++;
    if (success) {
      solver.metadata.successfulExecutions++;
    } else {
      solver.metadata.failedExecutions++;
    }

    // Update average response time
    const totalTime =
      solver.metadata.avgResponseTime * (solver.metadata.totalExecutions - 1) +
      executionTime;
    solver.metadata.avgResponseTime =
      totalTime / solver.metadata.totalExecutions;

    // Update reputation
    this.updateReputation(solverId);

    solver.lastSeen = Date.now();
  }

  /**
   * Calculate and update solver reputation
   */
  private updateReputation(solverId: string): void {
    const solver = this.solvers.get(solverId);
    if (!solver || solver.metadata.totalExecutions === 0) {
      return;
    }

    const meta = solver.metadata;

    // Success rate (0-1)
    const successRate = meta.successfulExecutions / meta.totalExecutions;

    // Speed score (inverse of response time, normalized)
    const avgSpeed = Math.max(0, 1 - meta.avgResponseTime / 60000); // 60s baseline

    // Cost efficiency (placeholder, would need actual cost data)
    const costEfficiency = 0.7;

    // Uptime score (based on recent activity)
    const timeSinceLastSeen = Date.now() - solver.lastSeen;
    const uptimeScore = Math.max(0, 1 - timeSinceLastSeen / 3600000); // 1h baseline

    // Security score (starts at 1, decreases with fraud)
    const securityScore = 1.0;

    // Weighted calculation
    solver.reputation =
      successRate * 0.4 +
      avgSpeed * 0.2 +
      costEfficiency * 0.2 +
      uptimeScore * 0.1 +
      securityScore * 0.1;

    // Clamp between 0 and 1
    solver.reputation = Math.max(0, Math.min(1, solver.reputation));
  }

  /**
   * Heartbeat from solver
   */
  heartbeat(solverId: string): void {
    const solver = this.solvers.get(solverId);
    if (solver) {
      solver.lastSeen = Date.now();
      if (solver.status === SolverStatus.OFFLINE) {
        this.updateStatus(solverId, SolverStatus.ACTIVE);
      }
    }
  }

  /**
   * Check for inactive solvers
   */
  checkInactiveSolvers(timeoutMs: number): void {
    const now = Date.now();
    for (const solver of this.solvers.values()) {
      if (
        solver.status !== SolverStatus.OFFLINE &&
        now - solver.lastSeen > timeoutMs
      ) {
        this.updateStatus(solver.id, SolverStatus.OFFLINE);
      }
    }
  }

  /**
   * List all solvers
   */
  listSolvers(filters?: { status?: SolverStatus }): Solver[] {
    let result = Array.from(this.solvers.values());

    if (filters?.status) {
      result = result.filter(s => s.status === filters.status);
    }

    return result.sort((a, b) => b.reputation - a.reputation);
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
