/** Browser flows on deployed (url) environments: capability admission and the origins pages may load from. */
import { describe, expect, it } from 'vitest';
import { capabilityGap } from '../src/core/capabilities.ts';
import { urlBrowserOrigins } from '../src/hosts/url.ts';

describe('browser on url environments', () => {
  it('admits ui capabilities on url hosts', () => {
    expect(capabilityGap('ui.navigate', 'url')).toBeNull();
    expect(capabilityGap('ui.observe', 'url')).toBeNull();
    expect(capabilityGap('ui.action', 'local_process')).toBeNull();
  });
  it('lets pages load from allowed https hosts and endpoints, never the app twice or plain http', () => {
    const binding = { network: { allow: ['clerk.example.com', 'https://cdn.example.net', 'app.example.com'] },
      endpoints: { api: 'https://api.example.com/v1', local: 'http://127.0.0.1:9000' } } as never;
    expect(urlBrowserOrigins(binding, 'https://app.example.com/')).toEqual([
      'https://clerk.example.com', 'https://cdn.example.net', 'https://api.example.com',
    ]);
  });
});
