/**
 * IPFS utilities for fetching and storing content.
 */

const IPFS_GATEWAY = 'https://ipfs.io/ipfs';

/**
 * Fetch content from IPFS by hash.
 * Supports ipfs:// prefix or raw hash.
 */
export async function fetchIPFSContent(hash: string): Promise<string> {
  const cleanHash = hash.replace('ipfs://', '');
  const url = `${IPFS_GATEWAY}/${cleanHash}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`IPFS fetch failed: ${response.statusText}`);
  }
  
  return response.text();
}

/**
 * Validate an IPFS hash format.
 * Accepts both Qm... and bafy... formats.
 */
export function isValidIPFSHash(hash: string): boolean {
  const cleanHash = hash.replace('ipfs://', '');
  return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cleanHash) ||
         /^bafy[0-9a-z]{48}$/.test(cleanHash);
}
