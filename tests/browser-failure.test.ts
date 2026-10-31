import { describe, expect, it } from 'vitest';
import { normalizeBrowserTestFailure } from './support/browserFailure.js';

describe('browser failure reporting', () => {
  it('preserves the failure but replaces anonymous browser eval stacks', () => {
    const error = new Error('page.evaluate: TypeError: missing geometry\n    at eval (anonymous-directory/)');
    const failure = normalizeBrowserTestFailure(error);
    expect(failure).not.toBe(error);
    expect(() => { throw failure; }).toThrow('page.evaluate: TypeError: missing geometry');
    expect(failure.stack).not.toContain('anonymous-directory');
    expect(failure.cause).toBeUndefined();
  });

  it('keeps assertion identity and expected/actual details intact', () => {
    const error = Object.assign(new Error('expected geometry to have clearance'), {
      name: 'AssertionError', expected: [], actual: ['leader overlaps count'],
    });
    expect(normalizeBrowserTestFailure(error)).toBe(error);
    expect(error.actual).toEqual(['leader overlaps count']);
  });

  it('also leaves an unknown thrown value as a failing error', () => {
    expect(() => { throw normalizeBrowserTestFailure(null); }).toThrow('unknown_browser_check_failure');
  });
});
