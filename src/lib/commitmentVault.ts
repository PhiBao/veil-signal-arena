/**
 * Commitment hashing utilities.
 *
 * NOTE: The reveal vault has been removed - all data is now stored on-chain.
 * This file only exports hash functions for preview/display purposes.
 */

export function generateSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashCommitmentPayload(payload: string) {
  const encoded = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', encoded)

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}