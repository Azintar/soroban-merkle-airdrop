/**
 * Augments Vitest's Assertion type with the toHaveNoViolations matcher
 * provided by jest-axe's expect.extend(toHaveNoViolations).
 */
import "vitest";

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<T = any> {
    toHaveNoViolations(): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}
