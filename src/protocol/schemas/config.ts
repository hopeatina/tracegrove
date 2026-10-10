import { z } from 'zod';
import { Cents, IdString, LIMITS, PositiveMillis } from '../primitives.ts';
import { EnvironmentClass } from './definitions.ts';

const FileRef = z.string().min(1).max(LIMITS.shortText).regex(/^\.\//, 'project-relative path starting with ./');

export const ConfigProfile = z.object({
  class: EnvironmentClass,
  environmentPlanRef: FileRef,
  hostPlanRef: FileRef.nullable(),
  personaRef: FileRef,
  fixturePlanRef: FileRef.nullable(),
  fidelityProfileRef: FileRef,
  runnerRef: FileRef,
  budget: z.object({ deadlineMs: PositiveMillis, costCeilingCents: Cents }).strict(),
}).strict();

export const WorkflowConfig = z.object({
  schemaVersion: z.literal('workflow.config/v1'),
  project: IdString,
  suiteRef: FileRef,
  defaultProfile: IdString,
  outputDir: z.string().min(1).max(LIMITS.shortText),
  sourceSetRef: FileRef.nullable(),
  executionHostRef: FileRef,
  intelligencePolicyRef: FileRef,
  profiles: z.record(IdString, ConfigProfile),
}).strict();
export type WorkflowConfig = z.infer<typeof WorkflowConfig>;

export const Suite = z.object({
  schemaVersion: z.literal('workflow.suite/v1'),
  id: IdString,
  cases: z.array(z.object({ caseRef: FileRef, required: z.boolean(), profiles: z.array(IdString).max(32).nullable() }).strict()).min(1).max(LIMITS.list),
}).strict();
export type Suite = z.infer<typeof Suite>;
