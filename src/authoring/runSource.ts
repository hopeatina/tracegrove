import { join } from 'node:path';
import { readVerifiedBundle } from '../core/bundle.ts';
import { HostPlan, digestOfValue, refKey } from '../protocol/index.ts';
import type { TestRunReport } from './run.ts';
import { describeSnapshot } from './verificationSource.ts';
import type { VerificationSourceBinding } from './sourceSelection.ts';

/** Historical labels come from captured request evidence, never the current preference. */
export function readRunSource(runDir: string, report: TestRunReport): TestRunReport & { sourceChecked: boolean; sourceIssue?: string } {
  try {
    const bundle = readVerifiedBundle(join(runDir, 'bundle'));
    if (bundle.campaign.outcome !== report.outcome || report.executionId !== bundle.receipts[0]?.executionId) throw new Error('report binding differs');
    const sources = bundle.selection.cells.map(cell => {
      const plan = HostPlan.parse(bundle.documents[refKey(cell.executionHostRef)]);
      return plan.launch?.sourceSnapshot ? describeSnapshot(plan.launch.sourceSnapshot.snapshot) : { kind: 'working_tree' as const };
    });
    const binding: VerificationSourceBinding | undefined = sources[0];
    if (!binding || sources.some(source => digestOfValue(source).hex !== digestOfValue(binding).hex)) throw new Error('source binding is unavailable');
    return { ...report, sourceBinding: binding, sourceChecked: true, bundleVerified: true };
  } catch {
    return { ...report, sourceBinding: null, sourceChecked: false, bundleVerified: false, sourceIssue: 'Saved evidence could not establish this run’s source binding.' };
  }
}
