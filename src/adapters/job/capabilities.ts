import { RunnerCapabilities, digestOfValue, parseAs } from '../../protocol/index.ts';
import { HTTP_RUNNER_CAPABILITIES } from '../http/capabilities.ts';
const ref = { id: 'tracegrove.runner.native-job', revision: '0.1.0' };
const capabilities = { ...HTTP_RUNNER_CAPABILITIES,
  operations: [...HTTP_RUNNER_CAPABILITIES.operations, 'job.submit', 'job.observe', 'job.cancel'],
  oracles: [...HTTP_RUNNER_CAPABILITIES.oracles, 'job.observation/1'], protocol: 'native_job' as const };
export const NATIVE_JOB_RUNNER_CAPABILITIES = parseAs(RunnerCapabilities, { ...capabilities, ref: { ...ref, digest: digestOfValue({ ...capabilities, ref }) } }, 'native job runner');
