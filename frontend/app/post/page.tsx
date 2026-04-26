"use client";

import { useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseUnits } from "viem";
import {
  CONTRACT_ADDRESSES,
  JOB_REGISTRY_ABI,
  ERC20_ABI,
  MINIPAY_FEE_CURRENCY,
} from "@/lib/contracts";
import { useMiniPay } from "@/hooks/useMiniPay";
import { ConnectPrompt } from "@/components/ConnectPrompt";
import { useRouter } from "next/navigation";

export default function PostJobPage() {
  const { address, isConnected } = useAccount();
  const { isMiniPay } = useMiniPay();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState("");
  const [bountyStr, setBountyStr] = useState("");
  const [deadlineStr, setDeadlineStr] = useState("");
  const [step, setStep] = useState<"approve" | "post">("approve");
  const [error, setError] = useState("");

  const bounty = bountyStr ? parseUnits(bountyStr, 18) : 0n;
  const deadlineTs = deadlineStr
    ? BigInt(Math.floor(new Date(deadlineStr).getTime() / 1000))
    : 0n;

  // Check current allowance
  const { data: allowance } = useReadContract({
    address: CONTRACT_ADDRESSES.cUSD,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address!, CONTRACT_ADDRESSES.jobRegistry],
    query: { enabled: !!address },
  });

  const needsApproval = allowance !== undefined && bounty > 0n && allowance < bounty;

  // Approve tx
  const {
    writeContract: approveWrite,
    data: approveTxHash,
    isPending: approveIsPending,
  } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // Post job tx
  const {
    writeContract: postWrite,
    data: postTxHash,
    isPending: postIsPending,
  } = useWriteContract();

  const { isLoading: postConfirming, isSuccess: postSuccess } =
    useWaitForTransactionReceipt({ hash: postTxHash });

  const feeCurrency = isMiniPay ? { feeCurrency: MINIPAY_FEE_CURRENCY } : {};

  const handleApprove = () => {
    setError("");
    approveWrite({
      address: CONTRACT_ADDRESSES.cUSD,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACT_ADDRESSES.jobRegistry, bounty],
      ...feeCurrency,
    } as Parameters<typeof approveWrite>[0]);
  };

  const handlePost = () => {
    setError("");
    if (!title.trim()) return setError("Title is required");
    if (!criteria.trim()) return setError("Acceptance criteria are required");
    if (bounty < parseUnits("1", 18)) return setError("Minimum bounty is 1 cUSD");
    if (deadlineTs <= BigInt(Math.floor((Date.now() + 3_600_000) / 1000)))
      return setError("Deadline must be at least 1 hour from now");

    postWrite(
      {
        address: CONTRACT_ADDRESSES.jobRegistry,
        abi: JOB_REGISTRY_ABI,
        functionName: "postJob",
        args: [title.trim(), criteria.trim(), bounty, Number(deadlineTs)],
        ...feeCurrency,
      } as Parameters<typeof postWrite>[0],
      {
        onSuccess: () => {
          setTimeout(() => router.push("/"), 2000);
        },
      }
    );
  };

  if (!isConnected) return <ConnectPrompt message="Connect your wallet to post a job" />;

  const isApproving = approveIsPending || approveConfirming;
  const isPosting = postIsPending || postConfirming;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Post a Job</h1>
        <p className="text-white/40 mt-2 text-sm">
          Define the task and bounty. Funds lock in escrow on posting. The AI
          releases payment when work meets your criteria.
        </p>
      </div>

      <div className="card space-y-6">
        {/* Title */}
        <div>
          <label className="label">Job Title</label>
          <input
            className="input"
            placeholder="e.g. Build a REST API for a todo app"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isPosting || postSuccess}
          />
        </div>

        {/* Acceptance criteria */}
        <div>
          <label className="label">Acceptance Criteria</label>
          <p className="text-xs text-white/30 mb-2">
            Plain language. The AI reads this to decide pass/fail. Be specific.
          </p>
          <textarea
            className="input min-h-[140px] resize-y"
            placeholder={`e.g.\n- Working Express.js API with GET /todos, POST /todos, DELETE /todos/:id\n- Persists data with SQLite\n- Includes a README with setup instructions\n- Tests pass with npm test`}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            disabled={isPosting || postSuccess}
          />
        </div>

        {/* Bounty */}
        <div>
          <label className="label">Bounty (cUSD)</label>
          <div className="relative">
            <input
              className="input pr-16"
              type="number"
              min="1"
              step="0.5"
              placeholder="10"
              value={bountyStr}
              onChange={(e) => setBountyStr(e.target.value)}
              disabled={isPosting || postSuccess}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm">
              cUSD
            </span>
          </div>
          <p className="text-xs text-white/30 mt-1">Minimum: 1 cUSD</p>
        </div>

        {/* Deadline */}
        <div>
          <label className="label">Deadline</label>
          <input
            className="input w-full"
            type="date"
            value={deadlineStr}
            min={new Date(Date.now() + 86_400_000).toISOString().split("T")[0]}
            onChange={(e) => setDeadlineStr(e.target.value)}
            disabled={isPosting || postSuccess}
          />
          <p className="text-xs text-white/30 mt-1">Earliest: tomorrow</p>
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        {postSuccess ? (
          <div className="text-center py-4">
            <p className="text-celo-green font-semibold text-lg">Job posted!</p>
            <p className="text-white/40 text-sm mt-1">Redirecting to jobs…</p>
          </div>
        ) : needsApproval && !approveSuccess ? (
          <div className="space-y-3">
            <p className="text-sm text-yellow-400/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2">
              You need to approve the contract to spend {bountyStr} cUSD first.
            </p>
            <button
              onClick={handleApprove}
              disabled={isApproving || bounty === 0n}
              className="btn-primary w-full"
            >
              {isApproving ? "Approving…" : `Approve ${bountyStr || "0"} cUSD`}
            </button>
          </div>
        ) : (
          <button
            onClick={handlePost}
            disabled={isPosting || !title || !criteria || bounty === 0n || deadlineTs === 0n}
            className="btn-primary w-full"
          >
            {isPosting ? "Posting…" : "Post Job & Lock Bounty"}
          </button>
        )}
      </div>

      {/* Info panel */}
      <div className="mt-6 card bg-celo-dark/40 border-celo-green/10 text-sm text-white/50 space-y-2">
        <p className="font-medium text-white/70">What happens next</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Your bounty is locked in the EscrowVault smart contract</li>
          <li>Freelancers can browse and accept your job</li>
          <li>After submission, Claude evaluates whether criteria are met</li>
          <li>On pass, cUSD releases to the freelancer automatically</li>
          <li>On fail or dispute, you may get a refund or human arbiters vote</li>
        </ul>
      </div>
    </div>
  );
}
