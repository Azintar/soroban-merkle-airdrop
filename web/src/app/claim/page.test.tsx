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
