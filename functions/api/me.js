// GET /api/me -> who is signed in (or null). POST /api/logout lives in logout.js.
import { json, currentUser } from './_auth.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ user: null, setup: false });
  const u = await currentUser(env.DB, request);
  return json({ user: u ? { name: u.name } : null, setup: true });
}
