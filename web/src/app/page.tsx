"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createAirdropClient, NETWORKS } from "@soroban-merkle-airdrop/sdk";
import { useNetwork } from "./context/NetworkContext";

/** Compute an integer percentage, clamped to [0, 100]. */
function calcPercent(claimed: bigint, deposited: bigint): number {
  if (deposited === 0n) return 0;
  const pct = Number((claimed * 10000n) / deposited) / 100;
  return Math.min(100, Math.max(0, pct));
}

export default function HomePage() {
  const { network, contractId } = useNetwork();

  const [totalClaimed, setTotalClaimed] = useState<bigint>(0n);
  const [totalDeposited, setTotalDeposited] = useState<bigint>(0n);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);

  useEffect(() => {
    if (!contractId) return;

    let cancelled = false;
    setStatsLoading(true);
    setStatsError(false);

    const client = createAirdropClient({ ...NETWORKS[network], contractId });

    Promise.all([client.totalClaimed(), client.totalDeposited()])
      .then(([claimed, deposited]) => {
        if (!cancelled) {
          setTotalClaimed(claimed);
          setTotalDeposited(deposited);
        }
      })
      .catch(() => {
        if (!cancelled) setStatsError(true);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contractId, network]);

  const percent = calcPercent(totalClaimed, totalDeposited);

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 56 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }} aria-hidden="true">🪂</div>
        <h1 style={{ fontSize: "clamp(28px, 6vw, 40px)", fontWeight: 800, marginBottom: 12 }}>
          Token Airdrop
        </h1>
        <p style={{ color: "#aaa", fontSize: "clamp(15px, 3vw, 18px)", maxWidth: 540, margin: "0 auto 32px" }}>
          Check if your address is eligible and claim your tokens using a
          cryptographic Merkle proof — verified on-chain.
        </p>
        <Link
          href="/claim"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "14px 36px",
            background: "#8ae4ff",
            color: "#000",
            fontWeight: 700,
            fontSize: 16,
            borderRadius: 10,
            textDecoration: "none",
            minHeight: 44,
          }}
        >
          Check Eligibility →
        </Link>
      </div>

      {/* ── Claim progress bar ── */}
      {!statsError && (
        <div
          data-testid="progress-section"
          style={{
            margin: "0 auto 48px",
            maxWidth: 540,
            padding: "20px 24px",
            border: "1px solid #222",
            borderRadius: 12,
            background: "#111",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13, color: "#aaa" }}>
            <span>Claim progress</span>
            {statsLoading ? (
              <span style={{ color: "#555" }}>Loading…</span>
            ) : (
              <span data-testid="progress-percent">{percent.toFixed(0)}%</span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label="Airdrop claim progress"
            aria-valuenow={statsLoading ? undefined : percent}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              height: 10,
              borderRadius: 999,
              background: "#222",
              overflow: "hidden",
            }}
          >
            <div
              data-testid="progress-bar"
              style={{
                height: "100%",
                width: statsLoading ? "0%" : `${percent}%`,
                background: "linear-gradient(90deg, #4caf50, #8ae4ff)",
                borderRadius: 999,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          {!statsLoading && totalDeposited > 0n && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#555" }}>
              {totalClaimed.toString()} / {totalDeposited.toString()} tokens claimed
            </p>
          )}
        </div>
      )}

      {/* ── Feature grid — 3 col on desktop, 2 col on tablet, 1 col on mobile ── */}
      <div className="feature-grid" role="list">
        {[
          {
            icon: "🌲",
            title: "Merkle Proof",
            desc: "Only a 32-byte root is stored on-chain. Recipients prove inclusion with a compact proof.",
          },
          {
            icon: "⚡",
            title: "Gas Efficient",
            desc: "No batch transfers. Each user claims independently — costs only their own transaction fee.",
          },
          {
            icon: "🔒",
            title: "No Double Claims",
            desc: "The contract tracks each claimed address. Once claimed, it cannot be claimed again.",
          },
        ].map(({ icon, title, desc }) => (
          <div
            key={title}
            role="listitem"
            style={{ border: "1px solid #222", borderRadius: 12, padding: 24, background: "#111" }}
          >
            <div style={{ fontSize: 28, marginBottom: 10 }} aria-hidden="true">{icon}</div>
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700 }}>{title}</h3>
            <p style={{ margin: 0, color: "#888", fontSize: 13, lineHeight: 1.6 }}>{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
