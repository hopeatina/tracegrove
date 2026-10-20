import { RunnerCapabilities, digestOfValue, parseAs } from '../../protocol/index.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../http/capabilities.ts';

const ref = { id: 'tracegrove.runner.conversation', revision: '0.1.0' };
const capabilities = { ...HTTP_RUNNER_CAPABILITIES, operations: [...HTTP_RUNNER_CAPABILITIES.operations, 'conversation.run'],
  oracles: [...HTTP_RUNNER_CAPABILITIES.oracles, 'conversation.observation/1'], protocol: 'conversation' as const };
export const CONVERSATION_RUNNER_CAPABILITIES = parseAs(RunnerCapabilities,
  { ...capabilities, ref: { ...ref, digest: digestOfValue({ ...capabilities, ref }) } }, 'conversation runner');
