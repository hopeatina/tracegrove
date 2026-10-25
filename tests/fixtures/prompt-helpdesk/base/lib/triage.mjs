// The triage agent: reads its system prompt from prompts/triage.md and sorts a ticket into a team and an urgency.
import { readFileSync } from 'node:fs';
import { ask } from './model.mjs';

const SYSTEM = readFileSync(new URL('../prompts/triage.md', import.meta.url), 'utf8');
const TEAMS = ['billing', 'technical', 'account'];

export async function triageTicket(ticket) {
  const answer = await ask(SYSTEM, `Subject: ${ticket.subject}\n\n${ticket.message}`);
  let parsed = {};
  try { parsed = JSON.parse(answer); } catch { /* the model did not answer JSON */ }
  return { team: TEAMS.includes(parsed.team) ? parsed.team : 'technical', urgency: ['low', 'normal', 'urgent'].includes(parsed.urgency) ? parsed.urgency : 'normal' };
}
