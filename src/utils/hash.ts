/**
 * Cryptographic hash utilities
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export class HashUtils {
  /**
   * Hash a string using SHA-256
   */
  hash(data: string): string {
    const bytes = new TextEncoder().encode(data);
    const hashBytes = sha256(bytes);
    return bytesToHex(hashBytes);
  }

  /**
   * Hash an object (JSON stringify first)
   */
  hashObject(obj: any): string {
    return this.hash(JSON.stringify(obj));
  }

  /**
   * Compute merkle root from array of hashes
   */
  computeMerkleRoot(hashes: string[]): string {
    if (hashes.length === 0) {
      return this.hash('');
    }

    if (hashes.length === 1) {
      return hashes[0];
    }

    // Build merkle tree bottom-up
    let currentLevel = [...hashes];

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          // Pair exists
          const combined = currentLevel[i] + currentLevel[i + 1];
          nextLevel.push(this.hash(combined));
        } else {
          // Odd one out, promote to next level
          nextLevel.push(currentLevel[i]);
        }
      }

      currentLevel = nextLevel;
    }

    return currentLevel[0];
  }

  /**
   * Generate merkle proof for a leaf
   */
  generateMerkleProof(hashes: string[], leafIndex: number): string[] {
    if (leafIndex < 0 || leafIndex >= hashes.length) {
      throw new Error('Invalid leaf index');
    }

    const proof: string[] = [];
    let currentLevel = [...hashes];
    let currentIndex = leafIndex;

    while (currentLevel.length > 1) {
      const nextLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          const combined = currentLevel[i] + currentLevel[i + 1];
          nextLevel.push(this.hash(combined));

          // Add sibling to proof if current index is in this pair
          if (i === currentIndex || i + 1 === currentIndex) {
            const sibling = i === currentIndex ? currentLevel[i + 1] : currentLevel[i];
            proof.push(sibling);
          }
        } else {
          nextLevel.push(currentLevel[i]);
        }
      }

      currentIndex = Math.floor(currentIndex / 2);
      currentLevel = nextLevel;
    }

    return proof;
  }
}
