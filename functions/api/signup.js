// POST /api/signup  { email, name, password, invite }  -> creates the account and signs the person in.
// Sign-up needs the invite code while the site is invite-only (settings row 'invite_hash'; remove the row to open it up).
import { json, readBody, cleanEmail, validEmail, cleanName, hashPassword, newSalt, startSession, sha256, same, tooMany, noteAttempt, clientIp } from './_auth.js';

export async function onRequestPost({ request, env }) {
  const db = env.DB; if (!db) return json({ error: 'Accounts are not set up yet.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: 'Bad request.' }, 400);
  const email = cleanEmail(body.email), name = cleanName(body.name), password = String(body.password || '');
  const ip = clientIp(request);
  if (await tooMany(db, 'su|' + ip, 8, 3600)) return json({ error: 'Too many tries. Try again in an hour.' }, 429);
  await noteAttempt(db, 'su|' + ip);
  if (!validEmail(email)) return json({ error: 'Enter a valid email address.' }, 400);
  if (name.length < 2) return json({ error: 'Enter your name (at least 2 letters).' }, 400);
  if (password.length < 10 || password.length > 100) return json({ error: 'Use a password of 10 to 100 characters.' }, 400);
  const inv = await db.prepare("SELECT v FROM settings WHERE k = 'invite_hash'").first();
  if (inv) {
    const given = await sha256(String(body.invite || '').trim().toUpperCase());
    if (!same(given, inv.v)) return json({ error: 'That invite code is not right.' }, 403);
  }
  const taken = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (taken) return json({ error: 'An account with that email already exists. Try signing in.' }, 409);
  const salt = newSalt(), iter = 100000, hash = await hashPassword(password, salt, iter);
  const r = await db.prepare('INSERT INTO users (email, name, pass_hash, salt, iter, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(email, name, hash, salt, iter, new Date().toISOString()).run();
  const id = r.meta.last_row_id;
  return json({ ok: true, user: { name } }, 200, { 'Set-Cookie': await startSession(db, id) });
}
