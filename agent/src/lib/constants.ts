/** Confidence >= this → automatic decision (release or refund) */
export const CONFIDENCE_AUTO = 0.85;

/** Confidence >= this → 48hr manual resolution window */
export const CONFIDENCE_MANUAL = 0.60;

/** Arbiter fee per resolved dispute in cUSD wei */
export const ARBITER_FEE_WEI = BigInt('20000000000000'); // 0.00002 cUSD

/** Max word count for criteria to use Haiku instead of Sonnet */
export const HAIKU_CRITERIA_WORD_LIMIT = 500;

/** Celo mainnet chain ID */
export const CELO_CHAIN_ID = 42220;

/** Celo Alfajores testnet chain ID */
export const CELO_ALFAJORES_CHAIN_ID = 44787;

/** Default RPC timeout in milliseconds */
export const RPC_TIMEOUT_MS = 30000;

/** Maximum retry attempts for RPC calls */
export const MAX_RPC_RETRIES = 3;

/** Gas limit buffer multiplier (1.2x estimated gas) */
export const GAS_LIMIT_BUFFER = 1.2;
