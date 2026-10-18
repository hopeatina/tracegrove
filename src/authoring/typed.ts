import type { z } from 'zod';
import type { AuthoringConfig, Fixture, Flow } from './schema.ts';

/** Editor types only. The compiler validates all formats against the same schemas. */
export function defineConfig(input: z.input<typeof AuthoringConfig>): z.input<typeof AuthoringConfig> { return input; }
export function flow(input: z.input<typeof Flow>): z.input<typeof Flow> { return input; }
export function fixture(input: z.input<typeof Fixture>): z.input<typeof Fixture> { return input; }
