"use client";

import { useConnect } from "wagmi";
import { injected } from "wagmi/connectors";

export function ConnectPrompt({ message = "Connect your wallet to continue" }: { message?: string }) {
  const { connect } = useConnect();
  return (
    <div className="text-center py-20">
      <p className="text-white/50 mb-4">{message}</p>
      <button
        onClick={() => connect({ connector: injected() })}
        className="btn-primary"
      >
        Connect Wallet
      </button>
    </div>
  );
}
