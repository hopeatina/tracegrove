import { RunnerCapabilities, digestOfValue, parseAs } from '../../protocol/index.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../http/capabilities.ts';

const ref = { id: 'tracegrove.runner.browser', revision: '0.1.0' };
const capabilities = {
  ...HTTP_RUNNER_CAPABILITIES,
  operations: [...HTTP_RUNNER_CAPABILITIES.operations, 'ui.navigate', 'ui.action', 'ui.observe'],
  oracles: [...HTTP_RUNNER_CAPABILITIES.oracles, 'browser.observation/1'],
  captureFormats: ['application/json', 'video/webm'],
  protocol: 'playwright' as const,
};
export const BROWSER_RUNNER_CAPABILITIES = parseAs(RunnerCapabilities, {
  ...capabilities, ref: { ...ref, digest: digestOfValue({ ...capabilities, ref }) },
}, 'browser runner capabilities');
