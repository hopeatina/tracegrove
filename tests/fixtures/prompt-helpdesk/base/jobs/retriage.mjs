// Nightly: tickets still waiting after a day are triaged again, in case their urgency changed.
import { triageTicket } from '../lib/triage.mjs';
export async function retriageStale(tickets, now = Date.now()) {
  for (const t of tickets) if (!t.replies.length && now - t.openedAt > 86_400_000) Object.assign(t, await triageTicket(t));
}
