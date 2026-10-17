import { z } from 'zod';

export const SampleName = z.enum(['notes-api', 'notes-django', 'notes-browser']);
export type SampleName = z.infer<typeof SampleName>;
