import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ClaimPage from "./page";

const TREE = {
  root: "00".repeat(32),
  proofs: {
    "GBTL47RTFR5EKMZSXWOQU735WBK7LRPPDIDK3JTNTCZZ7NUBBRDTVSK2": {
      amount: "1000",
      proof: [],
    },
  },
};

describe("ClaimPage — Fetch Tree debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function renderPageWithUrl(url: string) {
    render(<ClaimPage />);
    const urlInput = screen.getByLabelText(/merkle tree url/i);
    fireEvent.change(urlInput, { target: { value: url } });
    // The button's accessible name comes from its aria-label.
    return screen.getByRole("button", { name: /Fetch merkle tree from URL/i });
  }

  it("triggers only one fetch on two rapid clicks", async () => {
    let resolveFetch: (response: any) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const fetchBtn = renderPageWithUrl("https://example.com/merkle-tree.json");

    // Two rapid clicks within the debounce window
    fireEvent.click(fetchBtn);
    fireEvent.click(fetchBtn);

    // Debounced: nothing fetched yet while within the debounce window
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // Only a single network request despite two clicks
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/merkle-tree.json");

    resolveFetch({ ok: true, status: 200, json: async () => TREE });
    await act(async () => {});
  });

  it("disables the button while fetching", async () => {
    let resolveFetch: (response: any) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const fetchBtn = renderPageWithUrl("https://example.com/merkle-tree.json");

    fireEvent.click(fetchBtn);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await act(async () => {});

    // Button shows "Fetching…" and is disabled while the request is in flight
    const fetchingBtn = screen.getByRole("button", {
      name: /Fetch merkle tree from URL/i,
    });
    expect(fetchingBtn).toBeDisabled();
    expect(fetchingBtn.textContent).toContain("Fetching");

    // Resolve the fetch — button re-enables once complete
    resolveFetch({ ok: true, status: 200, json: async () => TREE });
    await act(async () => {});

    const fetchBtnAgain = screen.getByRole("button", {
      name: /Fetch merkle tree from URL/i,
    });
    expect(fetchBtnAgain).toBeEnabled();
    expect(fetchBtnAgain.textContent).toBe("Fetch Tree");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("ClaimPage — network badge", () => {
  it("renders the active network badge next to the heading", () => {
    renderWithNetwork(<ClaimPage />);

    const badge = screen.getByTestId("network-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent("testnet");
    expect(badge).toHaveClass("network-badge--testnet");
  });
});

describe("ClaimPage — expiration banner (#519)", () => {
  // Fixed "now" so expiration-relative assertions are deterministic.
  const NOW_SECS = BigInt(Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000));

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockResolvedValue(true);
    mockGetPublicKey.mockResolvedValue(ELIGIBLE_ADDRESS);
    mockIsClaimedFn.mockResolvedValue(false);
    // Pin Date.now so isExpired / expiresSoon are computed against a stable clock.
    vi.spyOn(Date, "now").mockReturnValue(Number(NOW_SECS) * 1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows "expires soon" banner when expiration is 24 hours from now', async () => {
    mockExpirationFn.mockResolvedValue(NOW_SECS + BigInt(24 * 60 * 60));
    renderWithNetwork(<ClaimPage />);

    await waitFor(() =>
      expect(screen.getByText(/claim soon/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/has expired/i)).not.toBeInTheDocument();
  });

  it('shows "airdrop has expired" banner when expiration is in the past', async () => {
    mockExpirationFn.mockResolvedValue(NOW_SECS - BigInt(60 * 60));
    renderWithNetwork(<ClaimPage />);

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/has expired/i)
    );
    expect(screen.queryByText(/claim soon/i)).not.toBeInTheDocument();
  });

  it("shows no expiration banner when expiration is 7 days from now", async () => {
    mockExpirationFn.mockResolvedValue(NOW_SECS + BigInt(7 * 24 * 60 * 60));
    renderWithNetwork(<ClaimPage />);

    await waitFor(() => expect(mockExpirationFn).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/has expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/claim soon/i)).not.toBeInTheDocument();
  });

  it("disables the Check button when the airdrop is expired", async () => {
    mockExpirationFn.mockResolvedValue(NOW_SECS - BigInt(60 * 60));
    renderWithNetwork(<ClaimPage />);

    await connectWallet(); // walletConnected → true, so disabled state reflects isExpired

    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /check eligibility/i });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("aria-disabled", "true");
    });
  });
});

describe("ClaimPage — tab navigation (#518)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConnected.mockResolvedValue(true);
    mockGetPublicKey.mockResolvedValue(ELIGIBLE_ADDRESS);
    mockIsClaimedFn.mockResolvedValue(false);
    // Keep expiration far-future so tab tests are not affected by expiration logic.
    mockExpirationFn.mockResolvedValue(99999999999n);
  });

  it("shows the Load from URL panel by default", () => {
    renderWithNetwork(<ClaimPage />);

    expect(
      screen.getByRole("tabpanel", { name: /load from url/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tabpanel", { name: /paste json/i })
    ).not.toBeInTheDocument();
    // The URL tab is selected by default.
    expect(screen.getByRole("tab", { name: /load from url/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("switches to the Paste JSON panel when the Paste JSON tab is clicked", async () => {
    renderWithNetwork(<ClaimPage />);

    await userEvent.click(screen.getByRole("tab", { name: /paste json/i }));

    expect(
      screen.getByRole("tabpanel", { name: /paste json/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tabpanel", { name: /load from url/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /paste json/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: /load from url/i })).toHaveAttribute(
      "aria-selected",
      "false"
    );
  });

  it("switches back to the Load from URL panel when its tab is clicked", async () => {
    renderWithNetwork(<ClaimPage />);

    await userEvent.click(screen.getByRole("tab", { name: /paste json/i }));
    expect(
      screen.getByRole("tabpanel", { name: /paste json/i })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /load from url/i }));

    expect(
      screen.getByRole("tabpanel", { name: /load from url/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tabpanel", { name: /paste json/i })
    ).not.toBeInTheDocument();
  });
});


