import { JobStatus, JOB_STATUS_LABEL, JOB_STATUS_COLOR } from "@/lib/contracts";
import clsx from "clsx";

export function StatusBadge({ status }: { status: number }) {
  const s = status as JobStatus;
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        JOB_STATUS_COLOR[s] ?? "bg-gray-500/20 text-gray-400"
      )}
    >
      {JOB_STATUS_LABEL[s] ?? "Unknown"}
    </span>
  );
}
