// POST /api/logout -> ends this session and clears the cookie.
import { json, readBody, tokenFrom, sha256, sessionCookie } from './_auth.js';

export async function onRequestPost({ request, env }) {
  const t = tokenFrom(request);
  if (env.DB && t && (await readBody(request))) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(t)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
}
