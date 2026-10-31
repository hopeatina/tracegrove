/** Keep the original assertion and its diff. Browser eval errors instead get a
 * Node-owned stack: Vitest can mistake an anonymous eval URL for a directory
 * while reading source maps, hiding the actual failure behind EISDIR.
 */
export function normalizeBrowserTestFailure(error: unknown): Error {
  if (error instanceof Error && error.name === 'AssertionError') return error;
  const message = error instanceof Error
    ? error.message.split('\n')[0]!.slice(0, 500)
    : 'unknown_browser_check_failure';
  return new Error(`Browser check failed: ${message}`);
}
