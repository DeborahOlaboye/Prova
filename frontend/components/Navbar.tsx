"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddress } from "@/lib/utils";
import { useMiniPay } from "@/hooks/useMiniPay";
import { useEffect } from "react";
import clsx from "clsx";

const NAV_LINKS = [
  { href: "/", label: "Jobs" },
  { href: "/post", label: "Post a Job" },
  { href: "/profile", label: "Profile" },
  { href: "/arbiter", label: "Arbiter" },
];

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { isMiniPay, address: miniPayAddress } = useMiniPay();

  // Auto-connect in MiniPay — no wallet modal needed
  useEffect(() => {
    if (isMiniPay && !isConnected) {
      connect({ connector: injected() });
    }
  }, [isMiniPay, isConnected, connect]);

  return (
    <nav className="border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-celo-green font-bold text-xl tracking-tight">
            prova
          </span>
          <span className="text-white/30 text-xs font-mono hidden sm:block">
            on Celo
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-celo-green/10 text-celo-green"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Wallet */}
        <div className="shrink-0 flex items-center gap-2">
          {isMiniPay && (
            <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-celo-green border border-celo-green/30 bg-celo-green/10 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-celo-green" />
              MiniPay
            </span>
          )}
          {isConnected && (address || miniPayAddress) ? (
            <button
              onClick={() => !isMiniPay && disconnect()}
              className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm font-mono hover:bg-white/5 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-celo-green" />
              {shortAddress((address || miniPayAddress)!)}
            </button>
          ) : !isMiniPay ? (
            <button
              onClick={() => connect({ connector: injected() })}
              className="btn-primary text-sm py-2 px-4"
            >
              Connect Wallet
            </button>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
