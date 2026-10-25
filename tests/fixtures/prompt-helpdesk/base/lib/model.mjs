// One call to the model: a system prompt and the user's text, answered as JSON.
const base = process.env.ANTHROPIC_URL ?? 'https://api.anthropic.com';
export async function ask(system, text) {
  const r = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '' },
    body: JSON.stringify({ model: 'claude-haiku', max_tokens: 400, system, messages: [{ role: 'user', content: text }] }) });
  const j = await r.json();
  return j.content?.[0]?.text ?? '';
}
