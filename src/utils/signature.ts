/**
 * Cryptographic signature utilities
 * Uses ed25519 for signing and verification
 */

import { randomBytes } from 'crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export class SignatureUtils {
  /**
   * Generate a new keypair
   */
  generateKeyPair(): { privateKey: string; publicKey: string } {
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = ed25519.getPublicKey(privateKey);

    return {
      privateKey: bytesToHex(privateKey),
      publicKey: bytesToHex(publicKey)
    };
  }

  /**
   * Sign a message
   */
  async sign(message: string, privateKeyHex: string): Promise<string> {
    const messageHash = sha256(new TextEncoder().encode(message));
    const privateKey = hexToBytes(privateKeyHex);
    const signature = ed25519.sign(messageHash, privateKey);

    return bytesToHex(signature);
  }

  /**
   * Verify a signature
   */
  async verify(
    message: string,
    signatureHex: string,
    publicKeyHex: string
  ): Promise<boolean> {
    try {
      const messageHash = sha256(new TextEncoder().encode(message));
      const signature = hexToBytes(signatureHex);
      const publicKey = hexToBytes(publicKeyHex);

      return ed25519.verify(signature, messageHash, publicKey);
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Get public key from private key
   */
  getPublicKey(privateKeyHex: string): string {
    const privateKey = hexToBytes(privateKeyHex);
    const publicKey = ed25519.getPublicKey(privateKey);
    return bytesToHex(publicKey);
  }
}
