#!/usr/bin/env node
/**
 * Agent Execution Market CLI
 * Command-line interface for interacting with the clearinghouse
 */

import { SignatureUtils } from '../utils/signature';
import { AEMClient } from '../client/AEMClient';

const sigUtils = new SignatureUtils();

interface CLIConfig {
  endpoint: string;
  privateKey?: string;
  publicKey?: string;
}

class AEMCLI {
  private config: CLIConfig;
  private client: AEMClient;

  constructor() {
    this.config = {
      endpoint: process.env.AEM_ENDPOINT || 'http://localhost:3000',
      privateKey: process.env.AEM_PRIVATE_KEY,
      publicKey: process.env.AEM_PUBLIC_KEY
    };

    this.client = new AEMClient(this.config.endpoint);
  }

  async run(args: string[]): Promise<void> {
    const command = args[2];
    const subcommand = args[3];

    try {
      switch (command) {
        case 'intent':
          await this.handleIntentCommand(subcommand, args.slice(4));
          break;

        case 'solver':
          await this.handleSolverCommand(subcommand, args.slice(4));
          break;

        case 'market':
          await this.handleMarketCommand(subcommand, args.slice(4));
          break;

        case 'keygen':
          this.handleKeyGen();
          break;

        case 'help':
        case '--help':
        case '-h':
          this.showHelp();
          break;

        default:
          console.error(`Unknown command: ${command}`);
          this.showHelp();
          process.exit(1);
      }
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

  private async handleIntentCommand(subcommand: string, args: string[]): Promise<void> {
    switch (subcommand) {
      case 'submit': {
        const intentData = this.parseArgs(args, {
          type: String,
          params: String,
          'max-fee': Number,
          deadline: Number
        });

        if (!this.config.privateKey) {
          throw new Error('Private key required. Set AEM_PRIVATE_KEY environment variable.');
        }

        const intent = {
          type: intentData.type,
          params: JSON.parse(intentData.params || '{}'),
          constraints: {
            maxFee: intentData['max-fee'],
            deadline: intentData.deadline || Date.now() + 60000
          }
        };

        const publicKey = sigUtils.getPublicKey(this.config.privateKey);
        const signature = await sigUtils.sign(
          JSON.stringify(intent),
          this.config.privateKey
        );

        const result = await this.client.submitIntent(intent, publicKey, signature);

        console.log('Intent submitted successfully!');
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'list': {
        const filters = this.parseArgs(args, {
          status: String,
          type: String
        });

        const intents = await this.client.listIntents(filters);

        console.log(`Found ${intents.length} intents:`);
        console.table(intents.map(i => ({
          ID: i.id.substring(0, 8),
          Type: i.type,
          Status: i.status,
          Fee: i.constraints.maxFee,
          Created: new Date(i.timestamp).toLocaleString()
        })));
        break;
      }

      case 'status': {
        const intentId = args[0];
        if (!intentId) {
          throw new Error('Intent ID required');
        }

        const intent = await this.client.getIntent(intentId);

        console.log('Intent Details:');
        console.log(JSON.stringify(intent, null, 2));
        break;
      }

      case 'cancel': {
        const intentId = args[0];
        if (!intentId || !this.config.privateKey) {
          throw new Error('Intent ID and private key required');
        }

        const publicKey = sigUtils.getPublicKey(this.config.privateKey);
        const signature = await sigUtils.sign(intentId, this.config.privateKey);

        await this.client.cancelIntent(intentId, publicKey, signature);

        console.log('Intent cancelled successfully');
        break;
      }

      default:
        console.error(`Unknown intent subcommand: ${subcommand}`);
        this.showHelp();
    }
  }

  private async handleSolverCommand(subcommand: string, args: string[]): Promise<void> {
    switch (subcommand) {
      case 'register': {
        const solverData = this.parseArgs(args, {
          capabilities: String,
          endpoint: String
        });

        if (!this.config.privateKey) {
          throw new Error('Private key required');
        }

        const publicKey = sigUtils.getPublicKey(this.config.privateKey);
        const capabilities = solverData.capabilities.split(',');

        const registration = {
          publicKey,
          endpoint: solverData.endpoint,
          capabilities
        };

        const signature = await sigUtils.sign(
          JSON.stringify(registration),
          this.config.privateKey
        );

        const solver = await this.client.registerSolver({
          ...registration,
          signature
        });

        console.log('Solver registered successfully!');
        console.log(JSON.stringify(solver, null, 2));
        break;
      }

      case 'list': {
        const solvers = await this.client.listSolvers();

        console.log(`Found ${solvers.length} solvers:`);
        console.table(solvers.map(s => ({
          ID: s.id.substring(0, 8),
          Status: s.status,
          Reputation: s.reputation.toFixed(2),
          Capabilities: s.capabilities.join(', '),
          Executions: s.metadata.totalExecutions
        })));
        break;
      }

      case 'status': {
        const solverId = args[0];
        if (!solverId) {
          throw new Error('Solver ID required');
        }

        const solver = await this.client.getSolver(solverId);

        console.log('Solver Details:');
        console.log(JSON.stringify(solver, null, 2));
        break;
      }

      default:
        console.error(`Unknown solver subcommand: ${subcommand}`);
        this.showHelp();
    }
  }

  private async handleMarketCommand(subcommand: string, args: string[]): Promise<void> {
    switch (subcommand) {
      case 'stats': {
        const stats = await this.client.getMarketStats();

        console.log('\nMarket Statistics:');
        console.log('═'.repeat(60));
        console.log(`Total Intents:      ${stats.totalIntents}`);
        console.log(`Active Intents:     ${stats.activeIntents}`);
        console.log(`Completed Intents:  ${stats.completedIntents}`);
        console.log(`Failed Intents:     ${stats.failedIntents}`);
        console.log(`Total Solvers:      ${stats.totalSolvers}`);
        console.log(`Active Solvers:     ${stats.activeSolvers}`);
        console.log(`Avg Reputation:     ${stats.avgReputation.toFixed(2)}`);
        console.log('═'.repeat(60));
        break;
      }

      case 'intents': {
        const filters = this.parseArgs(args, {
          status: String
        });

        const intents = await this.client.listIntents(filters);

        console.log(`\nActive Intents (${intents.length}):`);
        console.table(intents.map(i => ({
          ID: i.id.substring(0, 8),
          Type: i.type,
          Status: i.status,
          MaxFee: i.constraints.maxFee
        })));
        break;
      }

      case 'solvers': {
        const solvers = await this.client.listSolvers();

        console.log(`\nRegistered Solvers (${solvers.length}):`);
        console.table(solvers.map(s => ({
          ID: s.id.substring(0, 8),
          Status: s.status,
          Reputation: s.reputation.toFixed(2),
          Capabilities: s.capabilities.slice(0, 3).join(', ')
        })));
        break;
      }

      default:
        console.error(`Unknown market subcommand: ${subcommand}`);
        this.showHelp();
    }
  }

  private handleKeyGen(): void {
    const keyPair = sigUtils.generateKeyPair();

    console.log('\nNew Key Pair Generated:');
    console.log('═'.repeat(60));
    console.log('Private Key:');
    console.log(keyPair.privateKey);
    console.log('\nPublic Key:');
    console.log(keyPair.publicKey);
    console.log('═'.repeat(60));
    console.log('\nSave your private key securely!');
    console.log('Set it as environment variable:');
    console.log(`export AEM_PRIVATE_KEY="${keyPair.privateKey}"`);
  }

  private parseArgs(args: string[], schema: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (let i = 0; i < args.length; i += 2) {
      const key = args[i]?.replace(/^--/, '');
      const value = args[i + 1];

      if (schema[key]) {
        result[key] = schema[key] === Number ? parseInt(value) : value;
      }
    }

    return result;
  }

  private showHelp(): void {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║         Agent Execution Market - CLI Tool                    ║
╚══════════════════════════════════════════════════════════════╝

Usage: aem <command> [options]

Commands:

  intent submit          Submit a new intent
    --type <type>          Intent type
    --params <json>        Intent parameters (JSON string)
    --max-fee <amount>     Maximum fee willing to pay
    --deadline <timestamp> Deadline (unix timestamp, optional)

  intent list            List intents
    --status <status>      Filter by status (optional)
    --type <type>          Filter by type (optional)

  intent status <id>     Get intent status

  intent cancel <id>     Cancel an intent

  solver register        Register as a solver
    --capabilities <list>  Comma-separated capabilities
    --endpoint <url>       Solver endpoint URL

  solver list            List all solvers

  solver status <id>     Get solver details

  market stats           Show market statistics

  market intents         List active intents
    --status <status>      Filter by status

  market solvers         List registered solvers

  keygen                 Generate new keypair

  help                   Show this help message

Environment Variables:
  AEM_ENDPOINT          Clearinghouse endpoint (default: http://localhost:3000)
  AEM_PRIVATE_KEY       Your private key for signing
  AEM_PUBLIC_KEY        Your public key

Examples:

  # Generate keypair
  aem keygen

  # Submit intent
  aem intent submit \\
    --type data-fetch \\
    --params '{"url":"https://api.example.com"}' \\
    --max-fee 100

  # Register solver
  aem solver register \\
    --capabilities data-fetch,computation \\
    --endpoint https://my-solver.com

  # Check market stats
  aem market stats

For more information, visit: https://github.com/ZhenRobotics/agent-execution-market
    `);
  }
}

// Run CLI
const cli = new AEMCLI();
cli.run(process.argv).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
