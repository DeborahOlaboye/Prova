export async function fetchIPFSContent(hashOrUrl: string): Promise<string> {
  if (!hashOrUrl) return '';

  let url: string;
  if (hashOrUrl.startsWith('http')) {
    url = hashOrUrl;
  } else {
    const cid = hashOrUrl.startsWith('ipfs://') ? hashOrUrl.slice(7) : hashOrUrl;
    url = `https://w3s.link/ipfs/${cid}`;
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`IPFS fetch failed: ${response.statusText}`);
  return response.text();
}
