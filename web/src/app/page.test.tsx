/**
 * Tests for web/src/app/page.tsx (landing page)
 *
 * Covers:
 *   a. Progress bar shows 0% when totalClaimed = 0n.
 *   b. Progress bar shows 50% when totalClaimed = 500n, totalDeposited = 1000n.
 *   c. Progress bar shows 100% when fully claimed.
 *   d. "Check Eligibility" link is present and points to /claim.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithNetwork } from "../test/test-utils";
import HomePage from "./page";

// ─── Hoist mock functions ─────────────────────────────────────────────────────
const { mockTotalClaimedFn, mockTotalDepositedFn } = vi.hoisted(() => ({
  mockTotalClaimedFn: vi.fn<() => Promise<bigint>>(),
  mockTotalDepositedFn: vi.fn<() => Promise<bigint>>(),
}));

// ─── SDK mock ─────────────────────────────────────────────────────────────────
vi.mock("@soroban-merkle-airdrop/sdk", () => ({
  createAirdropClient: vi.fn(() => ({
    totalClaimed: mockTotalClaimedFn,
    totalDeposited: mockTotalDepositedFn,
  })),
  NETWORKS: {
    testnet: {
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
    mainnet: {
      rpcUrl: "https://mainnet.stellar.validation.network",
      networkPassphrase: "Public Global Stellar Network ; September 2015",
    },
  },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("HomePage — progress bar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a. shows 0% when totalClaimed is 0n", async () => {
    mockTotalClaimedFn.mockResolvedValue(0n);
    mockTotalDepositedFn.mockResolvedValue(1000n);

    renderWithNetwork(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("progress-percent")).toHaveTextContent("0%");
    });

    const bar = screen.getByTestId("progress-bar");
    expect(bar).toHaveStyle({ width: "0%" });
  });

  it("b. shows 50% when totalClaimed = 500n, totalDeposited = 1000n", async () => {
    mockTotalClaimedFn.mockResolvedValue(500n);
    mockTotalDepositedFn.mockResolvedValue(1000n);

    renderWithNetwork(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("progress-percent")).toHaveTextContent("50%");
    });

    const bar = screen.getByTestId("progress-bar");
    expect(bar).toHaveStyle({ width: "50%" });
  });

  it("c. shows 100% when fully claimed", async () => {
    mockTotalClaimedFn.mockResolvedValue(1000n);
    mockTotalDepositedFn.mockResolvedValue(1000n);

    renderWithNetwork(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("progress-percent")).toHaveTextContent("100%");
    });

    const bar = screen.getByTestId("progress-bar");
    expect(bar).toHaveStyle({ width: "100%" });
  });

  it("d. shows 0% and no division by zero when totalDeposited is 0n", async () => {
    mockTotalClaimedFn.mockResolvedValue(0n);
    mockTotalDepositedFn.mockResolvedValue(0n);

    renderWithNetwork(<HomePage />);

    await waitFor(() => {
      expect(screen.getByTestId("progress-percent")).toHaveTextContent("0%");
    });

    const bar = screen.getByTestId("progress-bar");
    expect(bar).toHaveStyle({ width: "0%" });
  });
});

describe("HomePage — Check Eligibility link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTotalClaimedFn.mockResolvedValue(0n);
    mockTotalDepositedFn.mockResolvedValue(0n);
  });

  it("d. 'Check Eligibility' link is present and points to /claim", () => {
    renderWithNetwork(<HomePage />);

    const link = screen.getByRole("link", { name: /check eligibility/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/claim");
  });
});
