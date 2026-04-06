import { formatUnits } from "viem";

export function formatCUSD(wei: bigint, decimals = 2): string {
  return parseFloat(formatUnits(wei, 18)).toFixed(decimals);
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatDeadline(ts: number): string {
  const date = new Date(ts * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isExpired(deadline: number): boolean {
  return deadline * 1000 < Date.now();
}

export function ipfsToHttp(hash: string): string {
  if (!hash) return "";
  if (hash.startsWith("http")) return hash;
  const cid = hash.startsWith("ipfs://") ? hash.slice(7) : hash;
  return `https://w3s.link/ipfs/${cid}`;
}
