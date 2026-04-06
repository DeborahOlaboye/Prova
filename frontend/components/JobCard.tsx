import Link from "next/link";
import { JobStruct, JobStatus } from "@/lib/contracts";
import { formatCUSD, formatDeadline, isExpired, shortAddress } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";

interface JobCardProps {
  job: JobStruct;
}

export function JobCard({ job }: JobCardProps) {
  const expired = isExpired(job.deadline);

  return (
    <Link href={`/jobs/${job.jobId}`} className="block group">
      <div className="card hover:border-celo-green/30 transition-colors group-hover:bg-white/[0.02]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white truncate group-hover:text-celo-green transition-colors">
              {job.title}
            </h3>
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
              Available →
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
