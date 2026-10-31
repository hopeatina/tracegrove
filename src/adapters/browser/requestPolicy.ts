/** Request admission is independent of diagnostics, so hidden bootstrap traffic is still bounded. */
export class BrowserRequestPolicy {
  private bootstrap: { entry: string; lastRequest?: string; redirects: number; requests: number } | null;

  constructor(private readonly input: {
    origin: string; mainFrameId: string; extraOrigins: ReadonlySet<string>;
    allowedMethods?: readonly string[]; allowedResourcePrefixes?: readonly string[];
    entry?: URL | null;
  }) {
    this.bootstrap = input.entry ? { entry: input.entry.href, redirects: 0, requests: 0 } : null;
  }

  allows(event: { requestId: string; redirectedRequestId?: string; frameId?: string; resourceType: string;
    request: { url: string; method: string } }): boolean {
    let url: URL;
    try { url = new URL(event.request.url); } catch { return false; }
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return false;
    const bootstrap = this.bootstrap;
    if (bootstrap && ++bootstrap.requests > 64) return false;
    const own = url.origin === this.input.origin;
    const extra = !own && this.input.extraOrigins.has(url.origin) && event.resourceType !== 'Document';
    if (!own && !extra) return false;
    if (this.input.allowedMethods && !this.input.allowedMethods.includes(event.request.method)) return false;

    // Credential setup permits only the exact entry document and at most eight
    // server redirects in that same main-frame GET/HEAD chain. It never admits
    // arbitrary bootstrap XHR, POSTs, iframe navigation or script navigation.
    let entryDocument = false;
    if (bootstrap && own && event.resourceType === 'Document' && event.frameId === this.input.mainFrameId
      && ['GET', 'HEAD'].includes(event.request.method)) {
      const first = !bootstrap.lastRequest && url.href === bootstrap.entry && !event.redirectedRequestId;
      const redirect = bootstrap.lastRequest === event.redirectedRequestId && !!event.redirectedRequestId
        && bootstrap.redirects < 8;
      if (first || redirect) {
        entryDocument = true;
        bootstrap.lastRequest = event.requestId;
        if (redirect) bootstrap.redirects++;
      }
    }
    return entryDocument || !this.input.allowedResourcePrefixes
      || this.input.allowedResourcePrefixes.some(prefix => url.pathname.startsWith(prefix));
  }

  finishBootstrap(): void { this.bootstrap = null; }
}
