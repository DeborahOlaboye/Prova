"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { JobStruct, JobStatus } from "@/lib/contracts";
import { formatCUSD, formatDeadline, isExpired, shortAddress, daysUntil } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

interface JobCardProps {
  job: JobStruct;
}

export function JobCard({ job }: JobCardProps) {
  const { address } = useAccount();
  const expired = isExpired(job.deadline);
  const isOwner = address?.toLowerCase() === job.client.toLowerCase();

  return (
    <Link href={`/jobs/${job.jobId}`} className="block group">
      <div className="card hover:border-celo-green/30 transition-colors group-hover:bg-white/[0.02]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white truncate group-hover:text-celo-green transition-colors">
                {job.title}
              </h3>
              {isOwner && (
                <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                  Your Job
                </span>
              )}
            </div>
            <p className="text-sm text-white/40 mt-1 font-mono">
              by {shortAddress(job.client)}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-celo-green font-bold text-lg">
              {formatCUSD(job.bounty)} cUSD
            </p>
            <StatusBadge status={job.status} />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-white/40">
          <span>
            Deadline:{" "}
            <span className={expired ? "text-red-400" : "text-white/60"}>
              {formatDeadline(job.deadline)}
              {expired && " (expired)"}
            </span>
          </span>
          {job.status === JobStatus.OPEN && !expired && (
            <span className="ml-auto text-celo-green font-medium">
              {isOwner
                ? "Awaiting freelancer"
                : daysUntil(job.deadline) <= 3
                ? `${daysUntil(job.deadline)}d left`
                : "Available →"}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
