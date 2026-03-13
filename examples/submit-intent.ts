/**
 * Submit Intent Example
 * Demonstrates how to submit an intent to the clearinghouse
 */

import { AEMClient } from '../src/client/AEMClient';
import { SignatureUtils } from '../src/utils/signature';

async function main() {
  // Initialize
  const sigUtils = new SignatureUtils();
  const privateKey = process.env.AEM_PRIVATE_KEY;

  if (!privateKey) {
    console.error('AEM_PRIVATE_KEY environment variable required');
    console.log('Generate one with: npm run cli keygen');
    process.exit(1);
  }

  const publicKey = sigUtils.getPublicKey(privateKey);
  const clearinghouseUrl = process.env.AEM_ENDPOINT || 'http://localhost:3000';
  const client = new AEMClient(clearinghouseUrl);

  // Create intent
  const intent = {
    type: 'data-fetch',
    params: {
      url: 'https://api.github.com/users/github',
      method: 'GET'
    },
    constraints: {
      maxFee: 100,
      deadline: Date.now() + 60000, // 1 minute from now
      minReputation: 0.5
    }
  };

  console.log('Submitting intent...');
  console.log(JSON.stringify(intent, null, 2));

  // Sign intent
  const signature = await sigUtils.sign(
    JSON.stringify(intent),
    privateKey
  );

  // Submit
  try {
    const result = await client.submitIntent(intent, publicKey, signature);

    console.log('\n✓ Intent submitted successfully!');
    console.log(`Intent ID: ${result.id}`);
    console.log(`Status: ${result.status}`);

    // Subscribe to events
    console.log('\nListening for updates...');

    const ws = client.subscribeToEvents(
      ['intent.assigned', 'intent.completed', 'intent.failed'],
      (event) => {
        console.log(`\n[${event.type}]`, event.data);

        if (event.data.id === result.id) {
          if (event.type === 'intent.completed') {
            console.log('\n✓ Intent completed successfully!');
            process.exit(0);
          } else if (event.type === 'intent.failed') {
            console.log('\n✗ Intent failed');
            process.exit(1);
          }
        }
      }
    );

    // Timeout after 2 minutes
    setTimeout(() => {
      console.log('\nTimeout waiting for intent completion');
      ws.close();
      process.exit(1);
    }, 120000);

  } catch (error) {
    console.error('Error submitting intent:', error);
    process.exit(1);
  }
}

main().catch(console.error);
