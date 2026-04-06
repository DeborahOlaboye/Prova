"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACT_ADDRESSES, JOB_REGISTRY_ABI, JobStruct } from "@/lib/contracts";
import { JobCard } from "@/components/JobCard";
import Link from "next/link";

export default function HomePage() {
  // Get total count of open jobs
  const { data: openCount } = useReadContract({
    address: CONTRACT_ADDRESSES.jobRegistry,
    abi: JOB_REGISTRY_ABI,
    functionName: "getOpenJobCount",
  });

  const count = openCount ? Number(openCount) : 0;

  // Read up to 20 open job IDs
  const idContracts = Array.from({ length: Math.min(count, 20) }, (_, i) => ({
    address: CONTRACT_ADDRESSES.jobRegistry,
    abi: JOB_REGISTRY_ABI,
    functionName: "openJobIds" as const,
    args: [BigInt(i)] as const,
  }));

  const { data: jobIdResults, isLoading: idsLoading } = useReadContracts({
    contracts: idContracts,
    query: { enabled: count > 0 },
  });

  const openJobIds = (jobIdResults ?? [])
    .map((r) => r.result as `0x${string}` | undefined)
    .filter((id): id is `0x${string}` => !!id);

  // Fetch each job's details
  const jobContracts = openJobIds.map((id) => ({
    address: CONTRACT_ADDRESSES.jobRegistry,
    abi: JOB_REGISTRY_ABI,
    functionName: "getJob" as const,
    args: [id] as const,
  }));

  const { data: jobResults, isLoading: jobsLoading } = useReadContracts({
    contracts: jobContracts,
    query: { enabled: openJobIds.length > 0 },
  });

  const jobs = (jobResults ?? [])
    .map((r) => r.result as JobStruct | undefined)
    .filter((j): j is JobStruct => !!j);

  const isLoading = idsLoading || jobsLoading;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-14">
        <h1 className="text-5xl font-bold mb-4">
          <span className="text-celo-green">Trustless</span> Freelance Escrow
        </h1>
        <p className="text-white/50 text-lg max-w-2xl mx-auto">
          Post tasks with cUSD bounties. Freelancers submit work. Escrow releases
          automatically — no payment rail blocks, no waiting for client approval.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8">
          <Link href="/post" className="btn-primary text-base px-8 py-3">
            Post a Job
          </Link>
          <Link href="/arbiter" className="btn-secondary text-base px-8 py-3">
            Become an Arbiter
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-12">
        {[
          { label: "Open Jobs", value: count.toString() },
          { label: "Network", value: "Celo" },
          { label: "Currency", value: "cUSD" },
        ].map(({ label, value }) => (
          <div key={label} className="card text-center">
            <p className="text-3xl font-bold text-celo-green">{value}</p>
            <p className="text-white/40 text-sm mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Open Jobs */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Open Jobs</h2>
        {count > 20 && (
          <span className="text-white/40 text-sm">Showing 20 of {count}</span>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-32 bg-white/5" />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-white/30 text-lg mb-2">No open jobs yet</p>
          <p className="text-white/20 text-sm mb-6">Be the first to post a job on Prova</p>
          <Link href="/post" className="btn-primary">
            Post the First Job
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {jobs.map((job) => (
            <JobCard key={job.jobId} job={job} />
          ))}
        </div>
      )}

      {/* How it works */}
      <div className="mt-20">
        <h2 className="text-xl font-semibold mb-8 text-center">How It Works</h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Client Posts a Job",
              desc: "Set acceptance criteria in plain language, a cUSD bounty, and a deadline. Funds lock in escrow instantly.",
            },
            {
              step: "02",
              title: "Freelancer Submits Work",
              desc: "Freelancer accepts the job, completes it, and submits deliverables — links, text, files via IPFS.",
            },
            {
              step: "03",
              title: "AI Evaluates & Pays",
              desc: "Claude reads the criteria and deliverable, returns a confidence score. High confidence → automatic payment or refund.",
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="card">
              <span className="text-celo-green font-mono text-sm">{step}</span>
              <h3 className="font-semibold mt-2 mb-2">{title}</h3>
              <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
