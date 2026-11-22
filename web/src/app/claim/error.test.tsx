import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClaimError from "./error";

describe("ClaimError — claim page error boundary", () => {
  it("renders the error message and a Try again button that resets the boundary", () => {
    const reset = vi.fn();
    render(
      <ClaimError error={new Error("RPC unavailable")} reset={reset} />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();

    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/rpc unavailable/i)).toBeInTheDocument();

    const btn = screen.getByRole("button", { name: /try again/i });
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
