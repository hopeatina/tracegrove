import { z } from 'zod';

export const SampleName = z.enum(['notes-api', 'notes-django', 'notes-browser', 'notes-mcp', 'report-jobs', 'report-native']);
export type SampleName = z.infer<typeof SampleName>;
