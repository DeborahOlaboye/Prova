import { useEffect, useState } from "react";
import { createWalletClient, custom } from "viem";
import { celo } from "viem/chains";

declare global {
  interface Window {
    ethereum?: {
      isMiniPay?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

export function useMiniPay() {
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [client, setClient] = useState<ReturnType<typeof createWalletClient> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }

    if (window.ethereum && window.ethereum.isMiniPay) {
      setIsMiniPay(true);

      const walletClient = createWalletClient({
        chain: celo,
        transport: custom(window.ethereum),
      });

      setClient(walletClient);

      walletClient.getAddresses().then(([addr]) => {
        setAddress(addr);
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  return { isMiniPay, address, client, isLoading };
}
