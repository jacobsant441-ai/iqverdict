// UFC fight detail for finished fights: how it ended (method, round, clock), judges' scores, every fight stat
// for both fighters, and the round-by-round events ESPN logs (knockdowns, takedowns, reversals).
// Reads public/data/ufcfights.json, writes public/data/ufcdetail.json (one row per finished fight, keyed by fight id).
// ESPN does NOT publish strikes per round, only whole-fight totals, so "round by round" is events + scorecards.
// Usage: node scripts/fetch-ufc-detail.js            (finished fights not stored yet, plus anything from the last 3 days)
//        node scripts/fetch-ufc-detail.js --all      (re-fetch everything)
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', 'public', 'data');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return d; } };
const ALL = process.argv.includes('--all');
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard';
const CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/';
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(c\)/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const ymd = (d, plus = 0) => { const m = String(d || '').match(/(\d+) (\w{3})/); if (!m) return null; const dt = new Date(Date.UTC(2026, Number(MON[m[2]]) - 1, Number(m[1]) + plus)); return dt.toISOString().slice(0, 10).replace(/-/g, ''); };
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'StatSniper/1.0' } }); if (r.ok) return await r.json(); if (r.status === 404) return null; } catch (e) { /* retry */ }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  return null;
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const KEEP = /^(knockDowns|totalStrikes|sigStrikes|sigDistance|sigClinch|sigGround|takedowns|submissions|reversals|advances|timeInControl|slamRate)/;

async function statsOf(evId, compId, athId) {
  const j = await get(`${CORE}${evId}/competitions/${compId}/competitors/${athId}/statistics`);
  const out = {};
  for (const c of (j && j.splits && j.splits.categories) || []) for (const s of c.stats || []) if (KEEP.test(s.name) && num(s.value) != null) out[s.name] = num(s.value);
  return out;
}
async function judgesOf(evId, compId, athId) {
  const j = await get(`${CORE}${evId}/competitions/${compId}/competitors/${athId}/linescores`);
  const top = j && j.items && j.items[0]; if (!top || !Array.isArray(top.linescores)) return [];
  return top.linescores.map((x) => num(x.value)).filter((v) => v != null);
}
async function eventsOf(evId, compId) {
  const j = await get(`${CORE}${evId}/competitions/${compId}/plays?limit=400`);
  const rounds = {};
  for (const p of (j && j.items) || []) {
    const n = p.period && p.period.number; const t = p.type && p.type.text;
    if (!n || !/^(Knockdown|Takedown|Takedown Attempt|Reversal|Submission Attempt|Round End)$/.test(t)) continue;
    (rounds[n] = rounds[n] || []).push({ t, clock: (p.clock && p.clock.displayValue) || '' });
  }
  return rounds;
}

(async () => {
  const fights = read('ufcfights.json', []);
  const old = read('ufcdetail.json', []);
  const by = new Map(old.map((r) => [r.id, r]));
  const now = Date.now();
  const recent = (f) => now - new Date((ymd(f.us_date || f.date) || '20200101').replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')).getTime() < 3 * 86400000;
  const todo = fights.filter((f) => f.status === 'Final' && f.result && (ALL || !by.has(f.id) || (recent(f) && now - new Date(by.get(f.id).fetched || 0).getTime() > 6 * 3600000)));
  if (!todo.length) { console.log('ufcdetail: nothing new'); return; }
  const boards = new Map();
  const board = async (d) => { if (!boards.has(d)) boards.set(d, await get(`${SITE}?dates=${d}`)); return boards.get(d); };
  let n = 0;
  for (const f of todo) {
    const d0 = ymd(f.us_date || f.date); if (!d0) continue;
    let ev = null, comp = null;
    for (const d of [d0, ymd(f.us_date || f.date, 1)]) {
      const sb = await board(d);
      for (const e of (sb && sb.events) || []) for (const c of e.competitions || []) {
        const nm = c.competitors.map((x) => norm(x.athlete && x.athlete.displayName));
        if (nm.includes(norm(f.a)) && nm.includes(norm(f.b))) { ev = e; comp = c; }
      }
      if (comp) break;
    }
    if (!comp) { console.log('no ESPN match for ' + f.a + ' v ' + f.b); continue; }
    const st = await get(`${CORE}${ev.id}/competitions/${comp.id}/status`);
    const ca = comp.competitors.find((x) => norm(x.athlete.displayName) === norm(f.a)), cb = comp.competitors.find((x) => norm(x.athlete.displayName) === norm(f.b));
    const win = comp.competitors.find((x) => x.winner);
    const row = {
      id: f.id, fetched: new Date().toISOString(),
      method: (st && st.result && st.result.displayName) || f.method || '', method_short: (st && st.result && st.result.shortDisplayName) || '',
      round: (st && st.period) || (comp.status && comp.status.period) || null, clock: (st && st.displayClock) || (comp.status && comp.status.displayClock) || '',
      scheduled_rounds: (comp.format && comp.format.regulation && comp.format.regulation.periods) || f.rounds || 3,
      winner: win ? win.athlete.displayName : '',
      a: { name: f.a, stats: await statsOf(ev.id, comp.id, ca.id), judges: await judgesOf(ev.id, comp.id, ca.id) },
      b: { name: f.b, stats: await statsOf(ev.id, comp.id, cb.id), judges: await judgesOf(ev.id, comp.id, cb.id) },
      rounds: await eventsOf(ev.id, comp.id),
    };
    by.set(f.id, row); n++;
  }
  fs.writeFileSync(path.join(DATA, 'ufcdetail.json'), JSON.stringify([...by.values()]));
  console.log(`ufcdetail: ${n} fights fetched, ${by.size} stored`);
})();
