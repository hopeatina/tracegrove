import { z } from 'zod';

export const SampleName = z.enum(['notes-api', 'notes-django']);
export type SampleName = z.infer<typeof SampleName>;
