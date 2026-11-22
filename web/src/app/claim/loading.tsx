/**
 * Loading skeleton for the claim page route segment.
 *
 * Next.js renders this automatically while the `/claim` segment is loading
 * (initial server render or client-side navigation), improving perceived
 * performance before the interactive ClaimPage hydrates.
 */

export default function ClaimLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading claim page"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 24,
        color: "var(--text)",
        minHeight: 300,
      }}
    >
      <div
        style={{
          height: 32,
          width: "44%",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          animation: "pulse 1.6s ease-in-out infinite",
        }}
      />
      <div
        style={{
          height: 20,
          width: "72%",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          animation: "pulse 1.6s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
