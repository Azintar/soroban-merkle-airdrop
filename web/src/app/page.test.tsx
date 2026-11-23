import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import HomePage from "./page";

type NetworkContextValue = {
  network: "testnet" | "mainnet";
  setNetwork: (n: "testnet" | "mainnet") => void;
  contractId: string;
};

// ─── Mock the NetworkContext module so useNetwork returns a controlled contractId ──
const { mockUseNetwork } = vi.hoisted(() => ({
  mockUseNetwork: vi.fn<() => NetworkContextValue>(),
}));

vi.mock("./context/NetworkContext", () => ({
  useNetwork: mockUseNetwork,
  NetworkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("HomePage — empty state (contractId not configured)", () => {
  beforeEach(() => {
    mockUseNetwork.mockReturnValue({
      contractId: "",
      network: "testnet",
      setNetwork: vi.fn(),
    });
  });

  it("renders the empty state when contractId is empty", () => {
    render(<HomePage />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/No airdrop contract configured./);
    expect(screen.getByText("NEXT_PUBLIC_AIRDROP_CONTRACT_ID")).toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes("in your environment."))
    ).toBeInTheDocument();
  });

  it("hides the Check Eligibility CTA when contractId is empty", () => {
    render(<HomePage />);

    expect(screen.queryByRole("link", { name: /check eligibility/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/check eligibility/i)).not.toBeInTheDocument();
  });

  it("does not render the feature grid when contractId is empty", () => {
    render(<HomePage />);

    expect(screen.queryByText(/merkle proof/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gas efficient/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no double claims/i)).not.toBeInTheDocument();
  });
});

describe("HomePage — contract configured", () => {
  beforeEach(() => {
    mockUseNetwork.mockReturnValue({
      contractId: "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      network: "testnet",
      setNetwork: vi.fn(),
    });
  });

  it("renders the full landing page with the CTA when contractId is set", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: /token airdrop/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /check eligibility/i })).toBeInTheDocument();
    expect(screen.queryByText(/No airdrop contract configured./)).not.toBeInTheDocument();
  });
});
