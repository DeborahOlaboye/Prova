"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  CONTRACT_ADDRESSES,
  ARBITER_POOL_ABI,
  ERC20_ABI,
  MINIPAY_FEE_CURRENCY,
} from "@/lib/contracts";
import { useMiniPay } from "@/hooks/useMiniPay";
import { formatCUSD } from "@/lib/utils";
import { ConnectPrompt } from "@/components/ConnectPrompt";
import { useState } from "react";

export default function ArbiterPage() {
  const { address, isConnected } = useAccount();
  const { isMiniPay } = useMiniPay();
  const feeCurrency = isMiniPay ? { feeCurrency: MINIPAY_FEE_CURRENCY } : {};
  const [voteDisputeId, setVoteDisputeId] = useState("");
  const [txError, setTxError] = useState("");

  // Arbiter status
  const { data: arbiterData, refetch: refetchArbiter } = useReadContract({
    address: CONTRACT_ADDRESSES.arbiterPool,
    abi: ARBITER_POOL_ABI,
    functionName: "arbiters",
    args: [address!],
    query: { enabled: !!address },
  });

  const { data: pendingFees, refetch: refetchFees } = useReadContract({
    address: CONTRACT_ADDRESSES.arbiterPool,
    abi: ARBITER_POOL_ABI,
    functionName: "pendingFees",
    args: [address!],
    query: { enabled: !!address },
  });

  const { data: activeCount } = useReadContract({
    address: CONTRACT_ADDRESSES.arbiterPool,
    abi: ARBITER_POOL_ABI,
    functionName: "activeArbiterCount",
  });

  const { data: stakeAmount } = useReadContract({
    address: CONTRACT_ADDRESSES.arbiterPool,
    abi: ARBITER_POOL_ABI,
    functionName: "STAKE_AMOUNT",
  });

  const { data: arbiterFeeAmount } = useReadContract({
    address: CONTRACT_ADDRESSES.arbiterPool,
    abi: ARBITER_POOL_ABI,
    functionName: "ARBITER_FEE",
  });

  // cUSD allowance for staking
  const { data: allowance } = useReadContract({
    address: CONTRACT_ADDRESSES.cUSD,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address!, CONTRACT_ADDRESSES.arbiterPool],
    query: { enabled: !!address },
  });

  const isArbiter = (arbiterData as { active?: boolean } | undefined)?.active ?? false;
  const unstakeRequestedAt = (arbiterData as { unstakeRequestedAt?: bigint } | undefined)
    ?.unstakeRequestedAt ?? 0n;
  const fees = (pendingFees ?? 0n) as bigint;
  const stake = (stakeAmount ?? 0n) as bigint;
  const arbiterFee = (arbiterFeeAmount ?? 0n) as bigint;
  const needsApproval = (allowance ?? 0n) < stake;

  // Approve stake
  const { writeContract: approveWrite, data: approveHash, isPending: approvePending } =
    useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveHash });

  // Stake
  const { writeContract: stakeWrite, data: stakeHash, isPending: stakePending } =
    useWriteContract();
  const { isLoading: stakeConfirming, isSuccess: stakeSuccess } =
    useWaitForTransactionReceipt({ hash: stakeHash });

  // Request unstake
  const { writeContract: requestUnstakeWrite, data: requestHash, isPending: requestPending } =
    useWriteContract();
  const { isLoading: requestConfirming } = useWaitForTransactionReceipt({ hash: requestHash });

  // Unstake
  const { writeContract: unstakeWrite, data: unstakeHash, isPending: unstakePending } =
    useWriteContract();
  const { isLoading: unstakeConfirming, isSuccess: unstakeSuccess } =
    useWaitForTransactionReceipt({ hash: unstakeHash });

  // Claim fees
  const { writeContract: claimWrite, data: claimHash, isPending: claimPending } =
    useWriteContract();
  const { isLoading: claimConfirming, isSuccess: claimSuccess } =
    useWaitForTransactionReceipt({ hash: claimHash });

  // Vote
  const { writeContract: voteWrite, data: voteHash, isPending: votePending } =
    useWriteContract();
  const { isLoading: voteConfirming, isSuccess: voteSuccess } =
    useWaitForTransactionReceipt({ hash: voteHash });

  const handleApprove = () => {
    setTxError("");
    approveWrite({
      address: CONTRACT_ADDRESSES.cUSD,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACT_ADDRESSES.arbiterPool, stake],
      ...feeCurrency,
    } as Parameters<typeof approveWrite>[0]);
  };

  const handleStake = () => {
    setTxError("");
    stakeWrite(
      { address: CONTRACT_ADDRESSES.arbiterPool, abi: ARBITER_POOL_ABI, functionName: "stake", ...feeCurrency } as Parameters<typeof stakeWrite>[0],
      { onSuccess: () => refetchArbiter() }
    );
  };

  const handleRequestUnstake = () => {
    setTxError("");
    requestUnstakeWrite(
      { address: CONTRACT_ADDRESSES.arbiterPool, abi: ARBITER_POOL_ABI, functionName: "requestUnstake", ...feeCurrency } as Parameters<typeof requestUnstakeWrite>[0],
      { onSuccess: () => refetchArbiter() }
    );
  };

  const handleUnstake = () => {
    setTxError("");
    unstakeWrite(
      { address: CONTRACT_ADDRESSES.arbiterPool, abi: ARBITER_POOL_ABI, functionName: "unstake", ...feeCurrency } as Parameters<typeof unstakeWrite>[0],
      { onSuccess: () => { refetchArbiter(); refetchFees(); } }
    );
  };

  const handleClaimFee = () => {
    setTxError("");
    claimWrite(
      { address: CONTRACT_ADDRESSES.arbiterPool, abi: ARBITER_POOL_ABI, functionName: "claimFee", ...feeCurrency } as Parameters<typeof claimWrite>[0],
      { onSuccess: () => refetchFees() }
    );
  };

  const handleVote = (vote: 1 | 2) => {
    setTxError("");
    if (!voteDisputeId.trim()) return setTxError("Enter a dispute ID");
    voteWrite({
      address: CONTRACT_ADDRESSES.arbiterPool,
      abi: ARBITER_POOL_ABI,
      functionName: "submitVote",
      args: [voteDisputeId.trim() as `0x${string}`, vote],
      ...feeCurrency,
    } as Parameters<typeof voteWrite>[0]);
  };

  const cooldownEnd = unstakeRequestedAt > 0n
    ? new Date((Number(unstakeRequestedAt) + 7 * 24 * 3600) * 1000)
    : null;
  const cooldownMet = cooldownEnd ? Date.now() > cooldownEnd.getTime() : false;

  if (!isConnected) return <ConnectPrompt message="Connect your wallet to access the arbiter panel" />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
      <div className="mb-2">
        <h1 className="text-3xl font-bold">Arbiter Panel</h1>
        <p className="text-white/40 mt-2 text-sm">
          Stake {formatCUSD(stake)} cUSD to become an arbiter. Earn {formatCUSD(arbiterFee)} cUSD
          for every dispute you vote on that reaches a majority decision.
        </p>
      </div>

      {/* Pool stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-celo-green">
            {activeCount !== undefined ? Number(activeCount).toString() : "—"}
          </p>
          <p className="text-white/40 text-xs mt-1">Active Arbiters</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-celo-gold">
            {formatCUSD(stake)} cUSD
          </p>
          <p className="text-white/40 text-xs mt-1">Stake Required</p>
        </div>
      </div>

      {txError && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
          {txError}
        </p>
      )}

      {/* Stake / Unstake */}
      <div className="card">
        <h2 className="font-semibold mb-4">Your Status</h2>

        {isArbiter ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-celo-green" />
              <span className="text-celo-green font-medium">Active Arbiter</span>
            </div>

            {unstakeRequestedAt === 0n ? (
              <div>
                <p className="text-white/40 text-sm mb-3">
                  To exit, request an unstake. There is a 7-day cooldown before you
                  can withdraw your stake.
                </p>
                <button
                  onClick={handleRequestUnstake}
                  disabled={requestPending || requestConfirming}
                  className="btn-secondary"
                >
                  {requestPending || requestConfirming ? "Requesting…" : "Request Unstake"}
                </button>
              </div>
            ) : cooldownMet ? (
              <div>
                <p className="text-celo-green text-sm mb-3">
                  Cooldown period complete. You can now withdraw your stake.
                </p>
                {unstakeSuccess ? (
                  <p className="text-celo-green text-sm">Unstaked successfully.</p>
                ) : (
                  <button
                    onClick={handleUnstake}
                    disabled={unstakePending || unstakeConfirming}
                    className="btn-primary"
                  >
                    {unstakePending || unstakeConfirming ? "Unstaking…" : "Withdraw Stake"}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-yellow-400/80 text-sm">
                Unstake requested. Cooldown ends{" "}
                {cooldownEnd?.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-white/40 text-sm">
              You are not currently staked. Stake {formatCUSD(stake)} cUSD to join
              the arbiter pool and earn {formatCUSD(arbiterFee)} cUSD per resolved dispute.
            </p>

            {stakeSuccess ? (
              <p className="text-celo-green text-sm font-medium">
                Staked! You are now an active arbiter.
              </p>
            ) : needsApproval && !approveSuccess ? (
              <div className="space-y-3">
                <p className="text-yellow-400/80 text-sm bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-2">
                  Approve the ArbiterPool contract to spend {formatCUSD(stake)} cUSD first.
                </p>
                <button
                  onClick={handleApprove}
                  disabled={approvePending || approveConfirming}
                  className="btn-primary"
                >
                  {approvePending || approveConfirming ? "Approving…" : `Approve ${formatCUSD(stake)} cUSD`}
                </button>
              </div>
            ) : (
              <button
                onClick={handleStake}
                disabled={stakePending || stakeConfirming}
                className="btn-primary"
              >
                {stakePending || stakeConfirming ? "Staking…" : `Stake ${formatCUSD(stake)} cUSD`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pending fees */}
      {isArbiter && (
        <div className="card">
          <h2 className="font-semibold mb-4">Pending Fees</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-celo-gold">{formatCUSD(fees)} cUSD</p>
              <p className="text-white/40 text-xs mt-1">Earned from dispute resolutions</p>
            </div>
            {claimSuccess ? (
              <p className="text-celo-green text-sm">Claimed!</p>
            ) : (
              <button
                onClick={handleClaimFee}
                disabled={claimPending || claimConfirming || fees === 0n}
                className="btn-primary"
              >
                {claimPending || claimConfirming ? "Claiming…" : "Claim Fees"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Vote on dispute */}
      {isArbiter && (
        <div className="card">
          <h2 className="font-semibold mb-2">Vote on a Dispute</h2>
          <p className="text-white/40 text-sm mb-4">
            If you have been selected for a dispute, paste the dispute ID below and cast
            your vote. RELEASE sends bounty to the freelancer; REFUND returns it to the client.
          </p>

          <input
            className="input mb-4"
            placeholder="Dispute ID (0x…)"
            value={voteDisputeId}
            onChange={(e) => setVoteDisputeId(e.target.value)}
            disabled={voteSuccess}
          />

          {voteSuccess ? (
            <p className="text-celo-green text-sm">Vote submitted!</p>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => handleVote(1)}
                disabled={votePending || voteConfirming || !voteDisputeId.trim()}
                className="btn-primary flex-1"
              >
                {votePending || voteConfirming ? "Submitting…" : "RELEASE to Freelancer"}
              </button>
              <button
                onClick={() => handleVote(2)}
                disabled={votePending || voteConfirming || !voteDisputeId.trim()}
                className="btn-danger flex-1"
              >
                {votePending || voteConfirming ? "Submitting…" : "REFUND to Client"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="card bg-celo-dark/40 border-celo-green/10 text-sm text-white/50 space-y-2">
        <p className="font-medium text-white/70">Arbiter Rules</p>
        <ul className="list-disc list-inside space-y-1">
          <li>3 arbiters are randomly selected per dispute</li>
          <li>First party to 2/3 votes wins</li>
          <li>Arbiters who vote earn {formatCUSD(arbiterFee)} cUSD per resolved dispute</li>
          <li>7-day cooldown before unstaking — you must complete any active disputes first</li>
        </ul>
      </div>
    </div>
  );
}
