// The reply agent: drafts a first answer to a ticket, with its own prompt.
import { readFileSync } from 'node:fs';
import { ask } from './model.mjs';

const SYSTEM = readFileSync(new URL('../prompts/reply.md', import.meta.url), 'utf8');
export async function draftReply(ticket) { return ask(SYSTEM, `${ticket.subject}\n\n${ticket.message}`); }
