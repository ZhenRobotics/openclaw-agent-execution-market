/**
 * Core type definitions for Agent Execution Market
 */

// ============================================================================
// Intent Types
// ============================================================================

export interface Intent {
  id: string;
  version: string;
  type: string;
  params: Record<string, any>;
  constraints: IntentConstraints;
  signature: string;
  submitter: string;
  timestamp: number;
  status: IntentStatus;
}

export interface IntentConstraints {
  maxFee: number;
  deadline: number;
  minReputation?: number;
  preferredSolvers?: string[];
  requireProof?: boolean;
}

export enum IntentStatus {
  PENDING = 'pending',
  BIDDING = 'bidding',
  ASSIGNED = 'assigned',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface IntentSubmission {
  type: string;
  params: Record<string, any>;
  constraints: IntentConstraints;
}

// ============================================================================
// Solver Types
// ============================================================================

export interface Solver {
  id: string;
  publicKey: string;
  endpoint: string;
  capabilities: string[];
  reputation: number;
  status: SolverStatus;
  metadata: SolverMetadata;
  registeredAt: number;
  lastSeen: number;
}

export enum SolverStatus {
  ACTIVE = 'active',
  BUSY = 'busy',
  OFFLINE = 'offline',
  SUSPENDED = 'suspended'
}

export interface SolverMetadata {
  name?: string;
  description?: string;
  version?: string;
  maxConcurrent: number;
  avgResponseTime: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
}

export interface SolverCapability {
  type: string;
  version: string;
  parameters?: Record<string, any>;
}

export interface SolverRegistration {
  publicKey: string;
  endpoint: string;
  capabilities: string[];
  metadata?: Partial<SolverMetadata>;
  signature: string;
}

// ============================================================================
// Bid Types
// ============================================================================

export interface Bid {
  id: string;
  intentId: string;
  solverId: string;
  fee: number;
  estimatedTime: number;
  executionPlan?: ExecutionPlan;
  signature: string;
  timestamp: number;
  status: BidStatus;
}

export enum BidStatus {
  SUBMITTED = 'submitted',
  SELECTED = 'selected',
  REJECTED = 'rejected',
  WITHDRAWN = 'withdrawn'
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  estimatedResources: ResourceEstimate;
  guarantees?: ExecutionGuarantee[];
}

export interface ExecutionStep {
  action: string;
  params: Record<string, any>;
  dependencies?: string[];
}

export interface ResourceEstimate {
  cpu?: number;
  memory?: number;
  storage?: number;
  network?: number;
  executionTime: number;
}

export interface ExecutionGuarantee {
  type: 'completion-time' | 'cost-cap' | 'quality-threshold';
  value: any;
}

// ============================================================================
// Execution Types
// ============================================================================

export interface ExecutionResult {
  intentId: string;
  solverId: string;
  success: boolean;
  data?: any;
  error?: ExecutionError;
  proof: ExecutionProof;
  metadata: ExecutionMetadata;
  timestamp: number;
}

export interface ExecutionError {
  code: string;
  message: string;
  details?: any;
}

export interface ExecutionMetadata {
  executionTime: number;
  gasUsed?: number;
  resourcesUsed?: ResourceEstimate;
  retries?: number;
}

// ============================================================================
// Verification Types
// ============================================================================

export interface ExecutionProof {
  intentId: string;
  solverId: string;
  preStateHash: string;
  postStateHash: string;
  resultHash: string;
  signature: string;
  timestamp: number;
  merkleRoot: string;
  merkleProof?: string[];
}

export interface VerificationResult {
  valid: boolean;
  proofId: string;
  checks: VerificationCheck[];
  timestamp: number;
}

export interface VerificationCheck {
  type: string;
  passed: boolean;
  details?: string;
}

export interface StateCommitment {
  hash: string;
  data: any;
  timestamp: number;
}

// ============================================================================
// Market Types
// ============================================================================

export interface MarketStats {
  totalIntents: number;
  activeIntents: number;
  completedIntents: number;
  failedIntents: number;
  totalSolvers: number;
  activeSolvers: number;
  totalVolume: number;
  avgExecutionTime: number;
  avgFee: number;
}

export interface ReputationScore {
  solverId: string;
  score: number;
  breakdown: {
    successRate: number;
    avgSpeed: number;
    costEfficiency: number;
    uptimeScore: number;
    securityScore: number;
  };
  lastUpdated: number;
}

// ============================================================================
// API Types
// ============================================================================

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export enum EventType {
  INTENT_SUBMITTED = 'intent.submitted',
  INTENT_ASSIGNED = 'intent.assigned',
  INTENT_COMPLETED = 'intent.completed',
  INTENT_FAILED = 'intent.failed',

  SOLVER_REGISTERED = 'solver.registered',
  SOLVER_UPDATED = 'solver.updated',
  SOLVER_OFFLINE = 'solver.offline',

  BID_SUBMITTED = 'bid.submitted',
  BID_SELECTED = 'bid.selected',

  EXECUTION_STARTED = 'execution.started',
  EXECUTION_COMPLETED = 'execution.completed',

  VERIFICATION_COMPLETED = 'verification.completed',
  VERIFICATION_FAILED = 'verification.failed'
}

export interface Event {
  id: string;
  type: EventType;
  data: any;
  timestamp: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ServerConfig {
  port: number;
  host: string;
  database?: DatabaseConfig;
  crypto: CryptoConfig;
  market: MarketConfig;
}

export interface DatabaseConfig {
  url: string;
  poolSize?: number;
}

export interface CryptoConfig {
  signingKey?: string;
  verificationNetwork: string;
}

export interface MarketConfig {
  solverMinReputation: number;
  solverTimeoutMs: number;
  bidWindowMs: number;
  platformFeePercent: number;
  minIntentFee: number;
}

export interface SolverConfig {
  solverId: string;
  privateKey: string;
  endpoint: string;
  capabilities: string[];
  bidStrategy: BidStrategy;
  resources: ResourceLimits;
}

export interface BidStrategy {
  type: 'competitive' | 'fixed-margin' | 'dynamic';
  marginPercent?: number;
  minFee?: number;
  maxFee?: number;
}

export interface ResourceLimits {
  maxConcurrent: number;
  maxMemoryMB: number;
  maxExecutionTimeMs: number;
}
