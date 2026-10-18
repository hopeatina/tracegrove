import { z } from 'zod';
import { CampaignResult, DigestSchema, ExecutionReceipt } from '../protocol/index.ts';
import { VerifiedBundleSnapshot } from './bundle.ts';

const Cell = z.object({ cell: z.string(), outcome: ExecutionReceipt.shape.outcome, reasonCodes: ExecutionReceipt.shape.reasonCodes,
  steps: z.array(z.string()), assertions: z.array(z.string()) }).strict();
const Step = ExecutionReceipt.shape.steps.element;
const binding = { verified: z.literal(true), manifestDigest: DigestSchema, executionId: z.string().nullable() };
export const ExecutionInspection = z.object({ schemaVersion: z.literal('tracegrove.execution-inspection/v1'), ...binding,
  campaignId: z.string(), outcome: CampaignResult.shape.outcome,
  coverage: CampaignResult.shape.coverage, cells: z.array(Cell),
}).strict();
export const FailedStepInspection = z.object({ ...binding,
  failed: z.array(z.object({ cell: z.string(), step: Step.shape.stepId, result: Step.shape.result, reason: Step.shape.reasonCode, output: Step.shape.output }).strict()),
}).strict();
export type ExecutionInspection = z.infer<typeof ExecutionInspection>;

/** Reports the independently reduced evidence, never raw producer labels. Nonsealed files are ignored. */
export function inspectExecution(snapshot: VerifiedBundleSnapshot, executionId: string | null = null): ExecutionInspection {
  const { campaign, receipts } = snapshot.records;
  return ExecutionInspection.parse({ schemaVersion: 'tracegrove.execution-inspection/v1', verified: true,
    manifestDigest: snapshot.manifestDigest, executionId, campaignId: campaign.campaignId, outcome: campaign.outcome, coverage: campaign.coverage,
    cells: receipts.map(({ selectionCellId, outcome, reasonCodes, steps, assertions }) => ({ cell: selectionCellId, outcome, reasonCodes,
      steps: steps.map(s => `${s.stepId}:${s.result}`), assertions: assertions.map(a => `${a.assertionId}:${a.result}`) })),
  });
}

/** Observation payloads are exposed only by the explicit failed-step inspection path. */
export function inspectFailedSteps(snapshot: VerifiedBundleSnapshot, executionId: string | null = null) {
  return FailedStepInspection.parse({ verified: true, manifestDigest: snapshot.manifestDigest, executionId,
    failed: snapshot.records.receipts.flatMap(r => r.steps.filter(s => s.result !== 'completed').slice(0, 1)
      .map(s => ({ cell: r.selectionCellId, step: s.stepId, result: s.result, reason: s.reasonCode, output: s.output }))),
  });
}
