/**
 * Minimal type declarations for jest-axe (no @types/jest-axe published for v9).
 */
declare module "jest-axe" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type AxeResults = any;

  export interface JestAxeConfigureOptions {
    rules?: Record<string, { enabled?: boolean }>;
    // Allow any other axe-core run options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }

  export function configureAxe(options?: JestAxeConfigureOptions): void;

  export function axe(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    html: Element | string | any,
    options?: JestAxeConfigureOptions
  ): Promise<AxeResults>;

  export const toHaveNoViolations: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toHaveNoViolations(results: any): {
      pass: boolean;
      message(): string;
    };
  };
}
