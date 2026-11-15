// POST /api/login  { email, password }  -> signs the person in.
import { json, readBody, cleanEmail, hashPassword, startSession, same, tooMany, noteAttempt, clientIp } from './_auth.js';

export async function onRequestPost({ request, env }) {
  const db = env.DB; if (!db) return json({ error: 'Accounts are not set up yet.' }, 503);
  const body = await readBody(request); if (!body) return json({ error: 'Bad request.' }, 400);
  const email = cleanEmail(body.email), password = String(body.password || '');
  const ip = clientIp(request);
  if (await tooMany(db, 'li|' + ip, 20, 900) || await tooMany(db, 'le|' + email, 8, 900)) return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429);
  const u = await db.prepare('SELECT id, name, pass_hash, salt, iter FROM users WHERE email = ?').bind(email).first();
  // Same work and same answer whether or not the email exists, so it can't be used to find who has an account.
  const hash = await hashPassword(password.slice(0, 100), u ? u.salt : 'AAAAAAAAAAAAAAAAAAAAAA==', u ? u.iter : 100000);
  if (!u || !same(hash, u.pass_hash)) { await noteAttempt(db, 'li|' + ip); await noteAttempt(db, 'le|' + email); return json({ error: 'Email or password is not right.' }, 401); }
  return json({ ok: true, user: { name: u.name } }, 200, { 'Set-Cookie': await startSession(db, u.id) });
}
