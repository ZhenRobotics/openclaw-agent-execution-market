/**
 * Agent Execution Market Server
 * REST API and WebSocket server for the clearinghouse
 */

import express, { Request, Response } from 'express';
import { Server as WebSocketServer } from 'ws';
import { createServer } from 'http';
import { IntentManager } from '../intent/IntentManager';
import { SolverRegistry } from '../solver/SolverRegistry';
import { MatchingEngine } from '../solver/MatchingEngine';
import { Verifier } from '../verification/Verifier';
import { SignatureUtils } from '../utils/signature';
import { HashUtils } from '../utils/hash';
import {
  APIResponse,
  IntentSubmission,
  SolverRegistration,
  EventType,
  IntentStatus
} from '../types';

export class AgentExecutionMarketServer {
  private app: express.Application;
  private httpServer: ReturnType<typeof createServer>;
  private wss: WebSocketServer;

  private sigUtils: SignatureUtils;
  private hashUtils: HashUtils;
  private intentManager: IntentManager;
  private solverRegistry: SolverRegistry;
  private matchingEngine: MatchingEngine;
  private verifier: Verifier;

  constructor(private port: number = 3000) {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    // Initialize core components
    this.sigUtils = new SignatureUtils();
    this.hashUtils = new HashUtils();
    this.intentManager = new IntentManager(this.sigUtils);
    this.solverRegistry = new SolverRegistry(this.sigUtils);
    this.matchingEngine = new MatchingEngine(
      this.intentManager,
      this.solverRegistry,
      this.sigUtils
    );
    this.verifier = new Verifier(this.sigUtils, this.hashUtils);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupEventHandlers();
    this.setupBackgroundTasks();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Intent routes
    this.app.post('/api/intents', this.handleSubmitIntent.bind(this));
    this.app.get('/api/intents', this.handleListIntents.bind(this));
    this.app.get('/api/intents/:id', this.handleGetIntent.bind(this));
    this.app.post('/api/intents/:id/cancel', this.handleCancelIntent.bind(this));

    // Solver routes
    this.app.post('/api/solvers/register', this.handleRegisterSolver.bind(this));
    this.app.get('/api/solvers', this.handleListSolvers.bind(this));
    this.app.get('/api/solvers/:id', this.handleGetSolver.bind(this));
    this.app.post('/api/solvers/:id/heartbeat', this.handleSolverHeartbeat.bind(this));

    // Bid routes
    this.app.post('/api/bids', this.handleSubmitBid.bind(this));
    this.app.get('/api/intents/:id/bids', this.handleGetIntentBids.bind(this));

    // Market stats
    this.app.get('/api/market/stats', this.handleMarketStats.bind(this));
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      console.log('WebSocket client connected');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });
    });
  }

  private setupEventHandlers(): void {
    // Broadcast events to WebSocket clients
    const eventTypes = [
      EventType.INTENT_SUBMITTED,
      EventType.BID_SUBMITTED,
      EventType.BID_SELECTED,
      EventType.INTENT_COMPLETED,
      EventType.INTENT_FAILED,
      EventType.SOLVER_REGISTERED
    ];

    eventTypes.forEach(eventType => {
      this.intentManager.on(eventType, (event) => {
        this.broadcastEvent(event);
      });

      this.solverRegistry.on(eventType, (event) => {
        this.broadcastEvent(event);
      });

      this.matchingEngine.on(eventType, (event) => {
        this.broadcastEvent(event);
      });
    });
  }

  private setupBackgroundTasks(): void {
    // Cleanup expired intents every minute
    setInterval(() => {
      this.intentManager.cleanupExpiredIntents();
    }, 60000);

    // Check for inactive solvers every 30 seconds
    setInterval(() => {
      this.solverRegistry.checkInactiveSolvers(60000); // 1 minute timeout
    }, 30000);
  }

  private handleWebSocketMessage(ws: any, data: any): void {
    // Handle different WebSocket message types
    switch (data.type) {
      case 'subscribe':
        // Client subscribes to specific event types
        ws.subscriptions = data.events || [];
        ws.send(JSON.stringify({ type: 'subscribed', events: ws.subscriptions }));
        break;

      default:
        ws.send(JSON.stringify({ error: 'Unknown message type' }));
    }
  }

  private broadcastEvent(event: any): void {
    this.wss.clients.forEach((client: any) => {
      if (client.readyState === 1) { // OPEN
        if (!client.subscriptions || client.subscriptions.includes(event.type)) {
          client.send(JSON.stringify({ type: 'event', event }));
        }
      }
    });
  }

  // API Handlers

  private async handleSubmitIntent(req: Request, res: Response): Promise<void> {
    try {
      const submission: IntentSubmission = req.body.intent;
      const publicKey = req.body.publicKey;
      const signature = req.body.signature;

      const intent = await this.intentManager.submitIntent(
        submission,
        publicKey,
        signature
      );

      // Start matching process asynchronously
      this.matchingEngine.startMatching(intent.id).catch(error => {
        console.error('Matching error:', error);
      });

      const response: APIResponse = {
        success: true,
        data: intent,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error: any) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'SUBMIT_INTENT_ERROR',
          message: error.message
        },
        timestamp: Date.now()
      };
      res.status(400).json(response);
    }
  }

  private handleListIntents(req: Request, res: Response): void {
    const filters = {
      status: this.getQueryParam(req.query.status) as IntentStatus | undefined,
      type: this.getQueryParam(req.query.type),
      submitter: this.getQueryParam(req.query.submitter)
    };

    const intents = this.intentManager.listIntents(filters);

    const response: APIResponse = {
      success: true,
      data: intents,
      timestamp: Date.now()
    };

    res.json(response);
  }

  private getQueryParam(param: any): string | undefined {
    if (typeof param === 'string') {
      return param;
    }
    if (Array.isArray(param) && param.length > 0) {
      return param[0];
    }
    return undefined;
  }

  private getParam(param: string | string[]): string {
    return Array.isArray(param) ? param[0] : param;
  }

  private handleGetIntent(req: Request, res: Response): void {
    const intent = this.intentManager.getIntent(this.getParam(req.params.id));

    if (!intent) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Intent not found'
        },
        timestamp: Date.now()
      };
      res.status(404).json(response);
      return;
    }

    const response: APIResponse = {
      success: true,
      data: intent,
      timestamp: Date.now()
    };

    res.json(response);
  }

  private async handleCancelIntent(req: Request, res: Response): Promise<void> {
    try {
      const { publicKey, signature } = req.body;

      await this.intentManager.cancelIntent(
        this.getParam(req.params.id),
        publicKey,
        signature
      );

      const response: APIResponse = {
        success: true,
        data: { cancelled: true },
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error: any) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'CANCEL_ERROR',
          message: error.message
        },
        timestamp: Date.now()
      };
      res.status(400).json(response);
    }
  }

  private async handleRegisterSolver(req: Request, res: Response): Promise<void> {
    try {
      const registration: SolverRegistration = req.body;

      const solver = await this.solverRegistry.registerSolver(registration);

      const response: APIResponse = {
        success: true,
        data: solver,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error: any) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'REGISTER_ERROR',
          message: error.message
        },
        timestamp: Date.now()
      };
      res.status(400).json(response);
    }
  }

  private handleListSolvers(req: Request, res: Response): void {
    const solvers = this.solverRegistry.listSolvers();

    const response: APIResponse = {
      success: true,
      data: solvers,
      timestamp: Date.now()
    };

    res.json(response);
  }

  private handleGetSolver(req: Request, res: Response): void {
    const solver = this.solverRegistry.getSolver(this.getParam(req.params.id));

    if (!solver) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Solver not found'
        },
        timestamp: Date.now()
      };
      res.status(404).json(response);
      return;
    }

    const response: APIResponse = {
      success: true,
      data: solver,
      timestamp: Date.now()
    };

    res.json(response);
  }

  private handleSolverHeartbeat(req: Request, res: Response): void {
    this.solverRegistry.heartbeat(this.getParam(req.params.id));

    const response: APIResponse = {
      success: true,
      data: { received: true },
      timestamp: Date.now()
    };

    res.json(response);
  }

  private async handleSubmitBid(req: Request, res: Response): Promise<void> {
    try {
      const { intentId, solverId, fee, estimatedTime, signature } = req.body;

      const bid = await this.matchingEngine.submitBid(
        intentId,
        solverId,
        fee,
        estimatedTime,
        signature
      );

      const response: APIResponse = {
        success: true,
        data: bid,
        timestamp: Date.now()
      };

      res.json(response);
    } catch (error: any) {
      const response: APIResponse = {
        success: false,
        error: {
          code: 'BID_ERROR',
          message: error.message
        },
        timestamp: Date.now()
      };
      res.status(400).json(response);
    }
  }

  private handleGetIntentBids(req: Request, res: Response): void {
    const bids = this.matchingEngine.getBidsForIntent(this.getParam(req.params.id));

    const response: APIResponse = {
      success: true,
      data: bids,
      timestamp: Date.now()
    };

    res.json(response);
  }

  private handleMarketStats(req: Request, res: Response): void {
    const intents = this.intentManager.listIntents();
    const solvers = this.solverRegistry.listSolvers();

    const stats = {
      totalIntents: intents.length,
      activeIntents: intents.filter(i => i.status === IntentStatus.PENDING || i.status === IntentStatus.BIDDING).length,
      completedIntents: intents.filter(i => i.status === IntentStatus.COMPLETED).length,
      failedIntents: intents.filter(i => i.status === IntentStatus.FAILED).length,
      totalSolvers: solvers.length,
      activeSolvers: solvers.filter(s => s.status === 'active').length,
      avgReputation: solvers.reduce((sum, s) => sum + s.reputation, 0) / (solvers.length || 1)
    };

    const response: APIResponse = {
      success: true,
      data: stats,
      timestamp: Date.now()
    };

    res.json(response);
  }

  public start(): void {
    this.httpServer.listen(this.port, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║           Agent Execution Market Clearinghouse               ║
║                                                              ║
║      The Intent Clearinghouse for Verifiable Execution      ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

Server running on:
  - HTTP: http://localhost:${this.port}
  - WebSocket: ws://localhost:${this.port}

API Endpoints:
  - POST   /api/intents              Submit intent
  - GET    /api/intents              List intents
  - POST   /api/solvers/register     Register solver
  - GET    /api/solvers              List solvers
  - POST   /api/bids                  Submit bid
  - GET    /api/market/stats         Market statistics

Ready to serve! 🚀
      `);
    });
  }

  public stop(): void {
    this.httpServer.close();
    this.wss.close();
  }
}

// Start server if run directly
if (require.main === module) {
  const port = parseInt(process.env.PORT || '3000');
  const server = new AgentExecutionMarketServer(port);
  server.start();
}
