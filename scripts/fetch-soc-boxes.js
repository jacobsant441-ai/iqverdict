// Soccer box scores for finished Premier League, La Liga and Champions League matches from ESPN (free, no key):
// team stats (possession, shots, passes, cards...), every player's line, and the goals / cards / subs.
// Only matches played in the last 3 days are added, and a match already in public/data/socbox.json is skipped,
// so each run just picks up the new games. Writes public/data/socbox.json (matched to our fixture / history ids).
// Usage: node scripts/fetch-soc-boxes.js
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'public', 'data');
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const LEAGUES = { 'Premier League': 'eng.1', 'La Liga': 'esp.1', 'Champions League': 'uefa.champions' };
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); } catch (e) { return []; } };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(fc|cf|afc|sc|club|de|the|hove)\b/g, ' ').replace(/\s+/g, ' ').trim();
async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: { 'User-Agent': 'IQVerdict/1.0' } }); if (r.ok) return await r.json(); } catch (e) { /* retry */ }
    await new Promise((res) => setTimeout(res, 500 * (i + 1)));
  }
  return null;
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const TEAM_KEYS = ['possessionPct', 'totalShots', 'shotsOnTarget', 'wonCorners', 'foulsCommitted', 'yellowCards', 'redCards', 'offsides', 'saves', 'accuratePasses', 'totalPasses', 'passPct', 'totalCrosses', 'accurateCrosses', 'totalTackles', 'effectiveTackles', 'interceptions', 'totalClearance', 'blockedShots'];
const KEEP_EVENT = /goal|card|substitution|penalty|own goal|var/i;

(async () => {
  const have = read('socbox.json'), seen = new Set(have.map((r) => r.espn));
  // our own match ids: fixtures (upcoming) and history (graded), matched by club names
  const ours = [...read('fixtures.json').map((x) => ({ id: x.id, league: x.league, home: x.home, away: x.away })),
    ...read('history.json').filter((h) => h.sport === 'fb').map((h) => ({ id: h.id, league: h.league, home: h.home_name, away: h.away_name }))];
  let added = 0;
  for (const [league, slug] of Object.entries(LEAGUES)) {
    for (let back = 0; back < 3; back++) {
      const sb = await getJson(`${SITE}${slug}/scoreboard?dates=${ymd(new Date(Date.now() - back * 86400000))}`);
      for (const ev of (sb && sb.events) || []) {
        if (!ev.status.type.completed || seen.has(ev.id)) continue;
        const c = ev.competitions[0], H = c.competitors.find((q) => q.homeAway === 'home'), A = c.competitors.find((q) => q.homeAway === 'away');
        const mine = ours.find((o) => o.league === league && norm(o.home) === norm(H.team.displayName) && norm(o.away) === norm(A.team.displayName))
          || ours.find((o) => o.league === league && norm(o.home).slice(0, 5) === norm(H.team.displayName).slice(0, 5) && norm(o.away).slice(0, 5) === norm(A.team.displayName).slice(0, 5));
        if (!mine) { console.warn('no match id for', H.team.displayName, 'v', A.team.displayName); continue; }
        const s = await getJson(`${SITE}${slug}/summary?event=${ev.id}`); if (!s || !s.boxscore) continue;
        const stat = (t) => { const x = Object.fromEntries(((s.boxscore.teams || []).find((q) => q.team.id === t.id) || { statistics: [] }).statistics.map((q) => [q.name, q.displayValue])); const o = {}; TEAM_KEYS.forEach((k) => { if (x[k] != null) o[k] = x[k]; }); return o; };
        const players = [];
        (s.rosters || []).forEach((r) => (r.roster || []).forEach((p) => {
          const v = Object.fromEntries((p.stats || []).map((q) => [q.name, Number(q.displayValue)])); if (!v.appearances && !p.starter) return;
          players.push({ side: r.homeAway, name: p.athlete.displayName, pos: (p.position && p.position.abbreviation) || '', num: p.jersey || '', starter: !!p.starter, on: !!p.subbedIn, off: !!p.subbedOut,
            g: v.totalGoals || 0, a: v.goalAssists || 0, sh: v.totalShots || 0, sot: v.shotsOnTarget || 0, fc: v.foulsCommitted || 0, fw: v.foulsSuffered || 0, yc: v.yellowCards || 0, rc: v.redCards || 0, off_: v.offsides || 0, sv: v.saves || 0, ga: v.goalsConceded || 0, og: v.ownGoals || 0 });
        }));
        const events = (s.keyEvents || []).filter((e) => e.type && KEEP_EVENT.test(e.type.text) && !/start|end|delay/i.test(e.type.text))
          .map((e) => ({ t: (e.clock && e.clock.displayValue) || '', type: e.type.text, side: e.team ? (e.team.id === H.team.id ? 'home' : 'away') : '', text: String(e.text || '').slice(0, 110) }));
        have.push({ id: mine.id, espn: ev.id, league, date: ev.date, home: H.team.displayName, away: A.team.displayName, hg: Number(H.score), ag: Number(A.score), teams: { home: stat(H.team), away: stat(A.team) }, players, events });
        seen.add(ev.id); added++;
      }
    }
  }
  fs.writeFileSync(path.join(DATA, 'socbox.json'), JSON.stringify(have));
  console.log('socbox: added ' + added + ' match(es); ' + have.length + ' on file');
})();
