"use client";

import { useParams } from "next/navigation";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useState } from "react";
import {
  CONTRACT_ADDRESSES,
  JOB_REGISTRY_ABI,
  ESCROW_VAULT_ABI,
  JobStatus,
  JobStruct,
  MINIPAY_FEE_CURRENCY,
} from "@/lib/contracts";
import { useMiniPay } from "@/hooks/useMiniPay";
import { formatCUSD, formatDeadline, shortAddress, isExpired, ipfsToHttp, celoscanAddress } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { ConnectPrompt } from "@/components/ConnectPrompt";

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { address, isConnected } = useAccount();
  const { isMiniPay } = useMiniPay();
  const feeCurrency = isMiniPay ? { feeCurrency: MINIPAY_FEE_CURRENCY } : {};

  const [deliverable, setDeliverable] = useState("");
  const [txError, setTxError] = useState("");

  // Fetch job data
  const { data: rawJob, isLoading, refetch } = useReadContract({
    address: CONTRACT_ADDRESSES.jobRegistry,
    abi: JOB_REGISTRY_ABI,
    functionName: "getJob",
    args: [jobId as `0x${string}`],
  });

  // Fetch locked escrow amount
  const { data: lockedAmount } = useReadContract({
    address: CONTRACT_ADDRESSES.escrowVault,
    abi: ESCROW_VAULT_ABI,
    functionName: "getLockedAmount",
    args: [jobId as `0x${string}`],
    query: { enabled: !!CONTRACT_ADDRESSES.escrowVault },
  });

  const job = rawJob as JobStruct | undefined;

  // Accept job
  const { writeContract: acceptWrite, data: acceptHash, isPending: acceptPending } =
    useWriteContract();
  const { isLoading: acceptConfirming, isSuccess: acceptSuccess } =
    useWaitForTransactionReceipt({ hash: acceptHash });

  // Submit work
  const { writeContract: submitWrite, data: submitHash, isPending: submitPending } =
    useWriteContract();
  const { isLoading: submitConfirming, isSuccess: submitSuccess } =
    useWaitForTransactionReceipt({ hash: submitHash });

  // Cancel job
  const { writeContract: cancelWrite, data: cancelHash, isPending: cancelPending } =
    useWriteContract();
  const { isLoading: cancelConfirming, isSuccess: cancelSuccess } =
    useWaitForTransactionReceipt({ hash: cancelHash });

  if (!isConnected) return <ConnectPrompt />;
  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="card animate-pulse h-64 bg-white/5" />
      </div>
    );
  }
  if (!job || !job.title) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center text-white/40">
        Job not found.
      </div>
    );
  }

  const isClient = address?.toLowerCase() === job.client.toLowerCase();
  const isFreelancer = address?.toLowerCase() === job.freelancer.toLowerCase();
  const expired = isExpired(job.deadline);

  const handleAccept = () => {
    setTxError("");
    acceptWrite(
      { address: CONTRACT_ADDRESSES.jobRegistry, abi: JOB_REGISTRY_ABI, functionName: "acceptJob", args: [job.jobId], ...feeCurrency } as Parameters<typeof acceptWrite>[0],
      { onSuccess: () => refetch() }
    );
  };

  const handleSubmit = () => {
    setTxError("");
    if (!deliverable.trim()) return setTxError("Deliverable link/hash is required");
    submitWrite(
      { address: CONTRACT_ADDRESSES.jobRegistry, abi: JOB_REGISTRY_ABI, functionName: "submitWork", args: [job.jobId, deliverable.trim()], ...feeCurrency } as Parameters<typeof submitWrite>[0],
      { onSuccess: () => refetch() }
    );
  };

  const handleCancel = () => {
    setTxError("");
    cancelWrite(
      { address: CONTRACT_ADDRESSES.jobRegistry, abi: JOB_REGISTRY_ABI, functionName: "cancelJob", args: [job.jobId], ...feeCurrency } as Parameters<typeof cancelWrite>[0],
      { onSuccess: () => refetch() }
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{job.title}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-white/40">
              <span>by {shortAddress(job.client)}</span>
              <span>·</span>
              <span>Posted {formatDeadline(job.postedAt)}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-celo-green text-2xl font-bold">
              {formatCUSD(job.bounty)} cUSD
            </p>
            <StatusBadge status={job.status} />
          </div>
        </div>

        <div className="mt-4 flex gap-4 text-sm text-white/40 flex-wrap">
          <span>
            Deadline:{" "}
            <span className={expired ? "text-red-400" : "text-white/60"}>
              {formatDeadline(job.deadline)}
              {expired && " · expired"}
            </span>
          </span>
          {lockedAmount !== undefined && (
            <span>
              Locked in escrow:{" "}
              <span className="text-white/60">{formatCUSD(lockedAmount)} cUSD</span>
            </span>
          )}
        </div>
      </div>

      {/* Acceptance criteria */}
      <div className="card">
        <h2 className="font-semibold mb-3">Acceptance Criteria</h2>
        {job.criteriaIPFSHash.startsWith("Qm") || job.criteriaIPFSHash.startsWith("baf") ? (
          <a
            href={ipfsToHttp(job.criteriaIPFSHash)}
            target="_blank"
            rel="noreferrer"
            className="text-celo-green underline text-sm"
          >
            View on IPFS →
          </a>
        ) : (
          <pre className="text-white/70 text-sm whitespace-pre-wrap leading-relaxed font-sans">
            {job.criteriaIPFSHash}
          </pre>
        )}
      </div>

      {/* Deliverable (if submitted) */}
      {job.deliverableIPFSHash && (
        <div className="card border-blue-500/30">
          <h2 className="font-semibold mb-3 text-blue-400">Submitted Deliverable</h2>
          <a
            href={ipfsToHttp(job.deliverableIPFSHash)}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 underline text-sm break-all"
          >
            {job.deliverableIPFSHash}
          </a>
        </div>
      )}

      {/* Participants */}
      {job.freelancer !== "0x0000000000000000000000000000000000000000" && (
        <div className="card">
          <h2 className="font-semibold mb-2 text-sm text-white/50">Freelancer</h2>
          <a
            href={celoscanAddress(job.freelancer)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-sm hover:text-celo-green transition-colors"
          >
            {job.freelancer} ↗
          </a>
        </div>
      )}

      {/* Actions */}
      {txError && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {txError}
        </p>
      )}

      {/* Client: cancel open job */}
      {isClient && job.status === JobStatus.OPEN && !expired && (
        <div className="card">
          <h2 className="font-semibold mb-3">Cancel Job</h2>
          <p className="text-white/40 text-sm mb-4">
            Cancelling will return your bounty to your wallet.
          </p>
          {cancelSuccess ? (
            <p className="text-celo-green text-sm">Job cancelled. Bounty refunded.</p>
          ) : (
            <button
              onClick={handleCancel}
              disabled={cancelPending || cancelConfirming}
              className="btn-danger"
            >
              {cancelPending || cancelConfirming ? "Cancelling…" : "Cancel Job"}
            </button>
          )}
        </div>
      )}

      {/* Freelancer: accept open job */}
      {!isClient && job.status === JobStatus.OPEN && !expired && (
        <div className="card border-celo-green/20">
          <h2 className="font-semibold mb-3">Accept This Job</h2>
          <p className="text-white/40 text-sm mb-4">
            Accepting locks you in as the freelancer. Complete the work before the
            deadline and submit your deliverable.
          </p>
          {acceptSuccess ? (
            <p className="text-celo-green text-sm">Job accepted! Get to work.</p>
          ) : (
            <button
              onClick={handleAccept}
              disabled={acceptPending || acceptConfirming}
              className="btn-primary"
            >
              {acceptPending || acceptConfirming ? "Accepting…" : "Accept Job"}
            </button>
          )}
        </div>
      )}

      {/* Freelancer: submit work */}
      {isFreelancer && job.status === JobStatus.IN_PROGRESS && (
        <div className="card border-blue-500/20">
          <h2 className="font-semibold mb-3">Submit Your Work</h2>
          <p className="text-white/40 text-sm mb-4">
            Paste an IPFS CID, a public URL, or any link to your deliverable. The AI
            will evaluate it against the acceptance criteria.
          </p>
          <div className="space-y-4">
            <input
              className="input"
              placeholder="IPFS CID or URL to your deliverable"
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
              disabled={submitPending || submitConfirming || submitSuccess}
            />
            {submitSuccess ? (
              <p className="text-celo-green text-sm">
                Work submitted! The AI agent will evaluate it shortly.
              </p>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitPending || submitConfirming || !deliverable.trim()}
                className="btn-primary"
              >
                {submitPending || submitConfirming ? "Submitting…" : "Submit Work"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Under review state */}
      {job.status === JobStatus.SUBMITTED && (
        <div className="card border-yellow-500/20 bg-yellow-500/5">
          <p className="text-yellow-400 font-medium">Under AI Review</p>
          <p className="text-white/40 text-sm mt-1">
            The Claude agent is evaluating this submission against the acceptance
            criteria. Escrow will release or refund automatically.
          </p>
        </div>
      )}

      {/* Completed */}
      {job.status === JobStatus.COMPLETED && (
        <div className="card border-emerald-500/20 bg-emerald-500/5">
          <p className="text-emerald-400 font-medium">Job Completed</p>
          <p className="text-white/40 text-sm mt-1">
            Work was accepted. {formatCUSD(job.bounty)} cUSD has been released to the
            freelancer.
          </p>
        </div>
      )}

      {/* Disputed */}
      {job.status === JobStatus.DISPUTED && (
        <div className="card border-red-500/20 bg-red-500/5">
          <p className="text-red-400 font-medium">Dispute in Progress</p>
          <p className="text-white/40 text-sm mt-1">
            The AI couldn&apos;t reach high confidence. Staked arbiters are voting on
            the outcome.
          </p>
        </div>
      )}
    </div>
  );
}
