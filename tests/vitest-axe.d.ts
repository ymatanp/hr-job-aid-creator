import 'vitest';
import type { AxeResults } from 'axe-core';

// Augment vitest's expect with the vitest-axe matcher used in UI tests.
interface AxeMatchers<R = unknown> {
  toHaveNoViolations(): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Assertion<T = unknown> extends AxeMatchers<T> {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

export type { AxeResults };
