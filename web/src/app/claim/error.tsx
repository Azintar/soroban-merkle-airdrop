"use client";

/**
 * Error boundary fallback for the claim page route segment.
 *
 * Next.js renders this automatically when the `/claim` segment throws an
 * unexpected error (e.g. a malformed RPC response), showing a friendly
 * fallback instead of a blank unmounted page.
 */

export default function ClaimError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        background: "var(--error-bg)",
        border: "1px solid var(--error-bd)",
        color: "var(--text)",
        padding: 20,
        borderRadius: 10,
        maxWidth: 440,
        width: "100%",
      }}
    >
      <h2
        style={{
          margin: "0 0 10px 0",
          fontSize: 18,
          fontWeight: 700,
          color: "var(--error)",
        }}
      >
        Something went wrong
      </h2>
      <p style={{ margin: "0 0 16px 0", fontSize: 14 }}>{error.message}</p>
      <button
        onClick={reset}
        type="button"
        style={{
          background: "var(--accent)",
          color: "var(--accent-fg)",
          border: "none",
          borderRadius: 8,
          padding: "10px 18px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          minHeight: 44,
        }}
      >
        Try again
      </button>
    </div>
  );
}
