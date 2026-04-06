"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import {
  CONTRACT_ADDRESSES,
  JOB_REGISTRY_ABI,
  REPUTATION_LEDGER_ABI,
  JobStruct,
} from "@/lib/contracts";
import { formatCUSD, shortAddress } from "@/lib/utils";
import { ConnectPrompt } from "@/components/ConnectPrompt";
import { JobCard } from "@/components/JobCard";

function ScoreRing({ score }: { score: number }) {
  const clamp = Math.min(100, Math.max(0, score));
  const color =
    clamp >= 80
      ? "#35D07F"
      : clamp >= 50
      ? "#FBCC5C"
      : "#f87171";

  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#2a2a2a" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${(clamp / 100) * 263.9} 263.9`}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-2xl font-bold" style={{ color }}>
        {clamp}
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const { address, isConnected } = useAccount();

  // Reputation score
  const { data: compositeScore } = useReadContract({
    address: CONTRACT_ADDRESSES.reputationLedger,
    abi: REPUTATION_LEDGER_ABI,
    functionName: "getCompositeScore",
    args: [address!],
    query: { enabled: !!address },
  });

  const { data: rawScore } = useReadContract({
    address: CONTRACT_ADDRESSES.reputationLedger,
    abi: REPUTATION_LEDGER_ABI,
    functionName: "getScore",
    args: [address!],
    query: { enabled: !!address },
  });

  // Job IDs as client and as freelancer
  const { data: clientJobIds } = useReadContract({
    address: CONTRACT_ADDRESSES.jobRegistry,
    abi: JOB_REGISTRY_ABI,
    functionName: "getClientJobs",
    args: [address!],
    query: { enabled: !!address },
  });

  const { data: freelancerJobIds } = useReadContract({
    address: CONTRACT_ADDRESSES.jobRegistry,
    abi: JOB_REGISTRY_ABI,
    functionName: "getFreelancerJobs",
    args: [address!],
    query: { enabled: !!address },
  });

  const allIds = [
    ...new Set([
      ...(clientJobIds ?? []),
      ...(freelancerJobIds ?? []),
    ]),
  ] as `0x${string}`[];

  // Fetch each job
  const { data: jobResults } = useReadContracts({
    contracts: allIds.map((id) => ({
      address: CONTRACT_ADDRESSES.jobRegistry,
      abi: JOB_REGISTRY_ABI,
      functionName: "getJob" as const,
      args: [id] as const,
    })),
    query: { enabled: allIds.length > 0 },
  });

  const jobs = (jobResults ?? [])
    .map((r) => r.result as JobStruct | undefined)
    .filter((j): j is JobStruct => !!j);

  const clientJobs = jobs.filter(
    (j) => j.client.toLowerCase() === address?.toLowerCase()
  );
  const freelancerJobs = jobs.filter(
    (j) => j.freelancer.toLowerCase() === address?.toLowerCase()
  );

  const score = compositeScore ? Number(compositeScore) : 0;
  const s = rawScore as
    | {
        jobsCompleted: number;
        jobsDisputed: number;
        disputesWon: number;
        avgRating: number;
        totalEarned: bigint;
        memberSince: number;
      }
    | undefined;

  if (!isConnected) return <ConnectPrompt message="Connect your wallet to view your profile" />;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
      {/* Header */}
      <div className="card flex items-center gap-8 flex-wrap">
        <ScoreRing score={score} />
        <div>
          <h1 className="text-2xl font-bold">{shortAddress(address!)}</h1>
          <p className="text-white/40 text-sm mt-1 font-mono">{address}</p>
          {s && s.memberSince > 0 && (
            <p className="text-white/30 text-xs mt-2">
              Member since{" "}
              {new Date(Number(s.memberSince) * 1000).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      </div>

      {/* Stats grid */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Jobs Completed", value: s.jobsCompleted.toString() },
            { label: "Disputes Won", value: `${s.disputesWon}/${s.jobsDisputed}` },
            { label: "Avg Rating", value: `${s.avgRating}/100` },
            { label: "Total Earned", value: `${formatCUSD(s.totalEarned)} cUSD` },
          ].map(({ label, value }) => (
            <div key={label} className="card text-center">
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-white/40 text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Score breakdown */}
      <div className="card">
        <h2 className="font-semibold mb-4">Reputation Score Breakdown</h2>
        {s && s.jobsCompleted > 0 ? (
          <div className="space-y-3 text-sm">
            {(() => {
              const completionBase = s.jobsCompleted + s.jobsDisputed;
              const completionRate =
                completionBase === 0 ? 0 : Math.round((s.jobsCompleted * 100) / completionBase);
              const disputeWinRate =
                s.jobsDisputed === 0
                  ? 100
                  : Math.round((s.disputesWon * 100) / s.jobsDisputed);
              const expScore = Math.min(100, s.jobsCompleted);
              return [
                { label: "Completion Rate", pct: completionRate, weight: 40 },
                { label: "Dispute Win Rate", pct: disputeWinRate, weight: 20 },
                { label: "Avg Client Rating", pct: s.avgRating, weight: 25 },
                { label: "Experience Score", pct: expScore, weight: 15 },
              ].map(({ label, pct, weight }) => (
                <div key={label}>
                  <div className="flex justify-between mb-1 text-white/60">
                    <span>{label}</span>
                    <span>
                      {pct}% × {weight}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-celo-green rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        ) : (
          <p className="text-white/30 text-sm">
            No reputation data yet. Complete your first job to build your score.
          </p>
        )}
      </div>

      {/* My Jobs as Freelancer */}
      {freelancerJobs.length > 0 && (
        <div>
          <h2 className="font-semibold mb-4">Jobs as Freelancer</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {freelancerJobs.map((job) => (
              <JobCard key={job.jobId} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* My Jobs as Client */}
      {clientJobs.length > 0 && (
        <div>
          <h2 className="font-semibold mb-4">Jobs I Posted</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {clientJobs.map((job) => (
              <JobCard key={job.jobId} job={job} />
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && (
        <div className="card text-center py-12 text-white/30">
          No job history yet.
        </div>
      )}
    </div>
  );
}
