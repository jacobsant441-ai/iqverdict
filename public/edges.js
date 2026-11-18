// IQVerdict matchup edges (two cards on the Best stats page):
//   1. "Players who beat their average against this team"  (every past game the player played against that opponent)
//   2. "Players who beat their average at this ground"     (every past game played at that team's home ground)
// For the coming games (today, and tomorrow from 4 pm Sydney) in NBA, football and NFL. A player shows up when his average in
// those games is clearly above his average this season (at least 20% and a real amount), he beat that season average in at
// least 60% of them, and there are enough games to mean something. Ranked by how far above, pulled down when the sample is small.
// Data: pgl (NBA game logs), socp (football), nflp (NFL), fixtures / games / nflgames (the coming games), table (football short names).
(function () {
  const SSX = window.SSX; if (!SSX) return;
  const { el, rows, bdX, badge, openPlayer, openAthlete } = SSX;

  // [key, label, value position in a game line (NBA) / column name (football, NFL), season-average floor, smallest real gap]
  const NBA = [['pts', 'PTS', 8, 8, 3], ['reb', 'REB', 9, 3, 1.5], ['ast', 'AST', 10, 2.5, 1.5], ['tpm', '3PM', 11, 1, 0.7]];
  const FB = [['totalShots', 'Shots', 'totalShots', 1, 0.7], ['shotsOnTarget', 'On target', 'shotsOnTarget', 0.6, 0.4], ['totalGoals', 'Goals', 'totalGoals', 0.2, 0.15]];
  const NFLS = [['passingYards', 'Pass yds', 'passingYards', 150, 25], ['rushingYards', 'Rush yds', 'rushingYards', 15, 12], ['receivingYards', 'Rec yds', 'receivingYards', 20, 15], ['receptions', 'Rec', 'receptions', 2, 1.5]];
  const MIN_GAMES = { nba: 3, fb: 2, nfl: 2 }, UP = 0.2, SHARE = 0.6;

  // One player's games as {date, season, team, opp, ha, v:{stat:number}}; NBA minutes ride along as v.min.
  function parse(sp, r) {
    const cols = sp === 'nba' ? null : String(r.cols || '').split(',');
    return String(r.g || '').split(';').filter(Boolean).map((s) => {
      const a = s.split(','), o = { date: a[0], season: a[1], team: a[2], opp: a[3], ha: a[4], v: {} };
      if (sp === 'nba') { NBA.forEach(([k, , i]) => { const x = a[i]; o.v[k] = x === '' || x == null || x === '-' ? null : +x; }); o.v.min = +a[7] || 0; o.x = { stl: +a[12] || 0, blk: +a[13] || 0, to: +a[14] || 0, fgm: +a[15] || 0 }; }
      else cols.forEach((c, i) => { const x = a[7 + i]; if (x != null && x !== '' && x !== '-' && Number.isFinite(+x)) o.v[c] = +x; });
      return o;
    });
  }
  const avg = (gs, k) => { const v = gs.map((g) => g.v[k]).filter((x) => typeof x === 'number'); return v.length ? { n: v.length, a: v.reduce((t, x) => t + x, 0) / v.length, v } : null; };

  // Every edge for one player against one set of games. mode 'opp' (games against code) or 'gr' (games at code's ground).
  function playerEdges(sp, r, gs, mode, code) {
    if (!gs.length) return [];
    const cur = gs.reduce((m, g) => (g.season > m ? g.season : m), ''), season = gs.filter((g) => g.season === cur);
    if (season.length < 5) return [];
    if (sp === 'nba' && season.reduce((t, g) => t + g.v.min, 0) / season.length < 12) return []; // bench fringe
    const sample = gs.filter((g) => (mode === 'opp' ? g.opp === code : (g.ha === 'H' && g.team === code) || (g.ha === 'A' && g.opp === code)));
    if (sample.length < MIN_GAMES[sp]) return [];
    const defs = sp === 'nba' ? NBA : sp === 'fb' ? FB : NFLS, out = [];
    defs.forEach(([k, lab, , floor, gap]) => {
      const kk = sp === 'nba' ? k : k, S = avg(season, kk), X = avg(sample, kk);
      if (!S || !X || X.n < MIN_GAMES[sp] || S.a < floor) return;
      const up = X.a / S.a - 1, beat = X.v.filter((x) => x > S.a).length;
      if (up < UP || X.a - S.a < gap || beat < Math.ceil(SHARE * X.n)) return;
      out.push({ stat: lab, season: S.a, sample: X.a, n: X.n, beat, up, score: up * (X.n / (X.n + 2)) });
    });
    return out;
  }

  // The coming games: today, and tomorrow from 4 pm Sydney; games already graded or live are left out.
  const dayKey = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(d).map((x) => [x.type, x.value])); return p.weekday + ' ' + p.day + ' ' + p.month; };
  function upcoming() {
    const abbr = (n) => { const t = rows('table').find((q) => q.team === n); return t ? t.abbr : String(n).slice(0, 3).toUpperCase(); };
    const items = [];
    rows('games').forEach((g) => items.push({ sp: 'nba', id: g.id, day: g.date, home: g.home, away: g.away, hn: g.home, an: g.away, time: g.time }));
    rows('fixtures').forEach((f) => items.push({ sp: 'fb', id: f.id, day: String(f.time).split(',')[0], home: abbr(f.home), away: abbr(f.away), hn: f.home, an: f.away, time: (String(f.time).split(', ')[1] || '').replace(' AEDT', '') }));
    rows('nflgames').forEach((g) => items.push({ sp: 'nfl', id: g.id, day: String(g.kick).split(',')[0], home: g.home, away: g.away, hn: g.home_name || g.home, an: g.away_name || g.away, time: String(g.kick).split(', ')[1] || '' }));
    const done = new Set(rows('history').filter((h) => h.status === 'Final' || h.status === 'Live').map((h) => (h.sport || 'nba') + '|' + h.id + '|' + h.date));
    const now = new Date(), hr = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hourCycle: 'h23' }).format(now)) % 24;
    const keys = (hr >= 16 ? [1, 0] : [0, 1]).map((k) => dayKey(new Date(now.getTime() + k * 86400000)));
    const ahead = items.filter((i) => !done.has(i.sp + '|' + i.id + '|' + i.day));
    for (const key of keys) { const g = ahead.filter((i) => i.day === key); if (g.length) return { key, games: g }; }
    return { key: '', games: [] };
  }

  const DS = { nba: 'pgl', fb: 'socp', nfl: 'nflp' };
  let cache = { gen: -1, m: {} };
  function playersOf(sp) { // parsed once per data version
    if (cache.gen !== SSX.dataGen) cache = { gen: SSX.dataGen, m: {} };
    if (cache.m[sp]) return cache.m[sp];
    const list = rows(DS[sp]).filter((r) => !(sp === 'fb' && r.pos === 'G')).map((r) => ({ r, gs: parse(sp, r) }));
    return (cache.m[sp] = list);
  }

  // [{game, edges:[{r, sp, team, stat, ...}]}] for a mode
  function compute(mode) {
    const up = upcoming(), out = [];
    up.games.forEach((g) => {
      const plist = playersOf(g.sp).filter((p) => p.r.team === g.home || p.r.team === g.away), edges = [];
      plist.forEach((p) => {
        const opp = p.r.team === g.home ? g.away : g.home, code = mode === 'opp' ? opp : g.home;
        playerEdges(g.sp, p.r, p.gs, mode, code).forEach((e) => edges.push({ ...e, r: p.r, sp: g.sp, opp, ground: g.home }));
      });
      edges.sort((a, b) => b.score - a.score);
      out.push({ game: g, edges });
    });
    return { key: up.key, games: out };
  }

  const f1 = (x) => (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10);
  const row = (e, mode) => {
    const b = el('button', null, 'bbr'); b.type = 'button';
    const l = el('div', null, 'l'), r = el('div', null, 'r');
    l.append(el('b', e.r.player + ' · ' + e.stat), el('span', mode === 'opp'
      ? `Averages ${f1(e.sample)} against ${e.opp} (${e.n} games) vs ${f1(e.season)} this season · beat it in ${e.beat} of ${e.n}`
      : `Averages ${f1(e.sample)} at ${e.ground}'s ground (${e.n} games) vs ${f1(e.season)} this season · beat it in ${e.beat} of ${e.n}`));
    r.append(el('b', '+' + Math.round(e.up * 100) + '%', 'c hi'), el('span', e.r.team + (e.sp === 'nba' ? '' : ''), ''));
    b.append(l, r);
    b.addEventListener('click', () => (e.sp === 'nba' ? openPlayer(e.r.player) : openAthlete(e.sp, e.r.pid)));
    return b;
  };

  function draw(box, mode) {
    const need = ['games', 'fixtures', 'nflgames', 'pgl', 'socp', 'nflp', 'history', 'table'];
    if (need.some((d) => dash.data(d).status === 'loading')) { box.replaceChildren(el('p', 'Loading…', 'plnone')); return; }
    const res = compute(mode);
    const blocks = res.games.filter((g) => g.edges.length);
    if (!blocks.length) { box.replaceChildren(el('p', res.key ? 'No standout players for ' + res.key + ' yet.' : 'No games coming up yet.', 'plnone')); return; }
    const out = [el('div', res.key, 'bbday')];
    const SPN = { nba: 'NBA', fb: 'Football', nfl: 'NFL' };
    blocks.forEach((g) => {
      const d = el('details'); d.open = blocks.length <= 3;
      const s = el('summary'); s.append(el('b', SPN[g.game.sp] + ' · ' + g.game.an + ' @ ' + g.game.hn + (g.game.time ? ' · ' + g.game.time : '')), el('span', ' ' + g.edges.length + (g.edges.length === 1 ? ' player' : ' players'), 'muted'));
      d.append(s, ...g.edges.slice(0, 10).map((e) => row(e, mode)));
      out.push(d);
    });
    box.replaceChildren(...out);
  }

  dash.draw('edgeopp', (box) => draw(box, 'opp'));
  dash.draw('edgeground', (box) => draw(box, 'gr'));
  // Best stats "Vs opponent": how often a player cleared a bookmaker line in every logged game against the team he faces next.
  // f is a prop row (propbook / propfind): {pid, stat, line, side, opp}. NBA only for now (that is where the lines are).
  const NBAV = { PTS: (g) => g.v.pts, REB: (g) => g.v.reb, AST: (g) => g.v.ast, '3PM': (g) => g.v.tpm, STL: (g) => g.x.stl, BLK: (g) => g.x.blk, SB: (g) => g.x.stl + g.x.blk, TOV: (g) => g.x.to,
    '2PM': (g) => g.x.fgm - g.v.tpm, PRA: (g) => g.v.pts + g.v.reb + g.v.ast, PR: (g) => g.v.pts + g.v.reb, PA: (g) => g.v.pts + g.v.ast, RA: (g) => g.v.reb + g.v.ast };
  let pidMap = { gen: -1, m: null };
  function oppHit(f) {
    const fn = NBAV[f.stat]; if (!fn || f.sp && f.sp !== 'nba' || !f.opp) return null;
    if (pidMap.gen !== SSX.dataGen || !pidMap.m) pidMap = { gen: SSX.dataGen, m: new Map(playersOf('nba').map((p) => [String(p.r.pid), p.gs])) };
    const gs = pidMap.m.get(String(f.pid)); if (!gs) return null;
    const line = Number(f.line), vs = gs.filter((g) => g.opp === f.opp && typeof g.v.pts === 'number');
    if (!vs.length) return { hit: 0, n: 0 };
    const under = f.side === 'under';
    return { hit: vs.filter((g) => (under ? fn(g) < line : fn(g) > line)).length, n: vs.length };
  }

  window.SSE = { parse, playerEdges, compute, upcoming, oppHit };
})();
