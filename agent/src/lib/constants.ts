/** Confidence >= this → automatic decision (release or refund) */
export const CONFIDENCE_AUTO = 0.85;

/** Confidence >= this → 48hr manual resolution window */
export const CONFIDENCE_MANUAL = 0.60;

/** Arbiter fee per resolved dispute in cUSD wei */
export const ARBITER_FEE_WEI = BigInt('20000000000000'); // 0.00002 cUSD

/** Max word count for criteria to use Haiku instead of Sonnet */
export const HAIKU_CRITERIA_WORD_LIMIT = 500;
