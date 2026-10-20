import { z } from 'zod';

export const SampleName = z.enum(['notes-api', 'notes-django', 'notes-browser', 'notes-mcp', 'report-jobs', 'report-native', 'voice-receptionist', 'support-chatbot']);
export type SampleName = z.infer<typeof SampleName>;

/** A bug an example can switch on, so `tracegrove try <example> --bug <name>` shows a real failure being caught. */
export type ExampleBug = { name: string; env: Record<string, string>; what: string; caughtBy: string };
export type Example = { name: SampleName; title: string; shows: string; needs: string | null; bugs: ExampleBug[] };

/** What `tracegrove try` offers, in the order it lists them. Samples that need extra setup say so. */
export const EXAMPLES: Example[] = [
  { name: 'voice-receptionist', title: 'Voice receptionist', shows: 'a dental clinic phone agent books, cancels and transfers calls; the backend is read back after each call', needs: null,
    bugs: [{ name: 'drop_booking', env: { RECEPTIONIST_BUG: 'drop_booking' }, what: 'the agent says "You\'re all set" but never saves the booking', caughtBy: 'front desk sees the booking' }] },
  { name: 'support-chatbot', title: 'Support chatbot', shows: 'a coffee shop support bot handles refunds, privacy questions and a prompt-injection attempt', needs: null,
    bugs: [{ name: 'leak_orders', env: { SHOP_BUG: 'leak_orders' }, what: 'the bot answers questions about other customers\' orders', caughtBy: 'customer asks about someone else\'s order' }] },
  { name: 'notes-api', title: 'Notes API', shows: 'create, read back, stranger denied, delete, confirm it is gone', needs: null,
    bugs: [
      { name: 'keep_on_delete', env: { NOTES_BUG: 'keep_on_delete' }, what: 'DELETE returns 204 but the note is still there', caughtBy: 'gone' },
      { name: 'share_with_strangers', env: { NOTES_BUG: 'share_with_strangers' }, what: 'any signed-in user can read anyone\'s note', caughtBy: 'intruder is denied' }] },
  { name: 'notes-browser', title: 'Notes in the browser', shows: 'a Chromium page and an API readback in one flow, with a recording', needs: 'Chromium: run `tracegrove setup browsers` once', bugs: [] },
  { name: 'notes-mcp', title: 'MCP server', shows: 'tool calls against an MCP server over Streamable HTTP, with readbacks', needs: null, bugs: [] },
  { name: 'report-jobs', title: 'Background jobs', shows: 'queued jobs complete, deduplicate, cancel and fail, checked from the worker\'s side', needs: null, bugs: [] },
];

export const exampleNamed = (name: string): Example | undefined => EXAMPLES.find((example) => example.name === name);
