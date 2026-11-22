/**
 * Contract error translation for the soroban-merkle-airdrop contract.
 *
 * Maps Rust AirdropError codes to human-readable CLI messages.
 * The Stellar SDK surfaces contract errors as strings like:
 *   "Error(Contract, #2)"
 * We scan for the numeric code or the variant name to produce a friendly
 * message; if nothing matches we return the raw error string.
 *
 * Rust AirdropError enum (source of truth):
 *   1 = AlreadyInitialized
 *   2 = AlreadyClaimed
 *   3 = InvalidProof
 *   4 = NotActive
 *   5 = NotInitialized
 *   6 = ZeroAmount
 *   7 = NotYetExpired
 *   8 = ExpirationInPast
 */

type ErrorPattern = [pattern: RegExp, message: string];

export const ERROR_MAP: ErrorPattern[] = [
  [/#1\b|AlreadyInitialized/i,  "This contract has already been initialized."],
  [/#2\b|AlreadyClaimed/i,      "This address has already claimed their allocation."],
  [/#3\b|InvalidProof/i,        "Invalid Merkle proof. Your proof file may be outdated or from a different airdrop."],
  [/#4\b|NotActive/i,           "The airdrop is currently paused. Please try again later."],
  [/#5\b|NotInitialized/i,      "The contract has not been initialized yet."],
  [/#6\b|ZeroAmount/i,          "Amount must be greater than zero."],
  [/#7\b|NotYetExpired/i,       "The airdrop has not expired yet. Reclaim is not permitted."],
  [/#8\b|ExpirationInPast/i,    "Expiration timestamp must be in the future."],
];

/**
 * Translate a raw Stellar SDK contract error string into a user-friendly
 * message, or return the original string if no mapping is found.
 *
 * @param rawError - The error message from the SDK, e.g. "Error(Contract, #2)".
 * @returns A human-readable message, or rawError if no match.
 */
export function translateContractError(rawError: string): string {
  for (const [pattern, message] of ERROR_MAP) {
    if (pattern.test(rawError)) {
      return message;
    }
  }
  return rawError;
}
