import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ClaimPage from "./page";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(() => Promise.resolve(true)),
  getPublicKey: vi.fn(() => Promise.resolve("GTEST123")),
  signTransaction: vi.fn(),
}));

describe("ClaimPage — Wallet disconnect", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  function renderPage() {
    render(<ClaimPage />);
    return screen.getByRole("button", {
      name: /Connect Freighter wallet/i,
    });
  }

  it("resets all wallet and claim state when Disconnect is clicked", async () => {
    const connectBtn = renderPage();

    // Connect the wallet (async freighter calls flush via microtasks)
    fireEvent.click(connectBtn);
    await act(async () => {
      await Promise.resolve();
    });

    // Wallet connected banner visible, Connect button gone
    expect(screen.getByText(/Wallet connected: GTEST123/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Connect Freighter wallet/i })
    ).not.toBeInTheDocument();

    // Disconnect button present
    const disconnectBtn = screen.getByRole("button", {
      name: /Disconnect wallet/i,
    });
    expect(disconnectBtn).toBeInTheDocument();

    // Click Disconnect
    fireEvent.click(disconnectBtn);

    // Connect Wallet button reappears; banner gone
    expect(
      screen.getByRole("button", { name: /Connect Freighter wallet/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Wallet connected: GTEST123/)
    ).not.toBeInTheDocument();
  });
});