// Shared helpers for the account API (Cloudflare Pages Functions + D1). Not a route: the leading underscore keeps it private.
// Passwords: PBKDF2-SHA256, random salt per user. Sessions: a random token in an HttpOnly cookie; only its SHA-256 is stored.
const ITER = 100000; // the most Workers allows for PBKDF2
const SESSION_DAYS = 30;
const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

export const json = (obj, status = 200, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
export async function hashPassword(password, saltB64, iter = ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, key, 256));
}
export const newSalt = () => b64(crypto.getRandomValues(new Uint8Array(16)));
export const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

export const cleanEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 30);

// Only JSON bodies from our own site are accepted (blocks cross-site form posts).
export async function readBody(request) {
  if (!/application\/json/i.test(request.headers.get('Content-Type') || '')) return null;
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return null;
  try { const t = await request.text(); if (t.length > 4000) return null; return JSON.parse(t); } catch (e) { return null; }
}

// Too many tries from one address, or on one email, in a short time: slow down.
export async function tooMany(db, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('DELETE FROM attempts WHERE at < ?').bind(now - 3600).run();
  const r = await db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE k = ? AND at > ?').bind(key, now - windowSec).first();
  return (r && r.n) >= limit;
}
export const noteAttempt = (db, key) => db.prepare('INSERT INTO attempts (k, at) VALUES (?, ?)').bind(key, Math.floor(Date.now() / 1000)).run();
export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'unknown';

export const cookieName = '__Host-iqv';
export function sessionCookie(token, maxAge) { return `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
export async function startSession(db, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Math.floor(Date.now() / 1000), exp = now + SESSION_DAYS * 86400;
  await db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, exp, new Date().toISOString()).run();
  return sessionCookie(token, SESSION_DAYS * 86400);
}
export function tokenFrom(request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|; )' + cookieName + '=([a-f0-9]{64})'));
  return m ? m[1] : null;
}
export async function currentUser(db, request) {
  const t = tokenFrom(request); if (!t) return null;
  const now = Math.floor(Date.now() / 1000);
  return await db.prepare('SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(await sha256(t), now).first();
}
