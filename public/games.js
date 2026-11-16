// IQVerdict: Best stats on Home, My bets in Review.
// Loaded after the main page script; uses its helpers through window.SSX (each script file runs in its own scope).
//
// Main play: of the bets we can put a chance on (winner, spread, total), the one with the highest
// chance by our research that pays at least $1.40. Prices are the best Australian price (odds.json)
// when a bookmaker offers that bet, else the US price ESPN shows (DraftKings), else an estimate.
// Chances for spreads and totals come from our projected margin and total (normal spread: NBA 12 / 17
// points, NFL 13.5 / 13), at whatever line the price is for.
(() => {
  // opened from the iPhone home screen: mark the page so the top can sit below iOS's faded edge (app.css html.pwa)
  try { if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) document.documentElement.classList.add('pwa'); } catch (e) { /* old browser */ }
  const X = window.SSX; if (!X) return;
  // ---- Pull to refresh (phones): at the top of a page, pull down; the IQVerdict logo drops in, and past the line
  // ("Release to refresh") letting go reloads the app with fresh data (and the loading screen). Short pulls just go back.
  (() => {
    if (!('ontouchstart' in window)) return;
    const box = document.createElement('div'); box.id = 'ssptr';
    box.innerHTML = '<span class="ptrlogo"><img src="icons/icon-192.png" alt=""></span><small>Pull to refresh</small>';
    document.body.append(box);
    const lab = box.querySelector('small'), logo = box.querySelector('.ptrlogo');
    const LINE = 70, MAX = 110;
    let y0 = null, x0 = 0, pull = 0, busy = false;
    const set = (d) => { pull = d; box.style.transform = 'translate(-50%,' + (Math.min(d, MAX) - 60) + 'px)'; box.style.opacity = String(Math.min(1, d / 40)); logo.style.transform = 'rotate(' + d * 3 + 'deg)'; lab.textContent = d >= LINE ? 'Release to refresh' : 'Pull to refresh'; box.classList.toggle('ready', d >= LINE); };
    const reset = () => { box.classList.add('back'); set(0); setTimeout(() => box.classList.remove('back'), 260); };
    const blocked = (t) => !!(t.closest && t.closest('input,select,textarea,#ssload,.scroll,.scr,.hstrip,.days,.nfltabs,.lgbar,.sports,.chips'));
    document.addEventListener('touchstart', (e) => { if (busy || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) { y0 = null; return; } y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (y0 == null || busy) return; const t = e.touches[0], dy = t.clientY - y0, dx = Math.abs(t.clientX - x0);
      if (window.scrollY > 0 || dy <= 0 || dx > dy) { if (pull) reset(); if (dy < -5 || dx > dy) y0 = null; return; }
      set(dy * 0.5);
    }, { passive: true });
    document.addEventListener('touchend', () => {
      if (y0 == null || busy) return; y0 = null;
      if (pull >= LINE) { busy = true; box.classList.add('spin'); lab.textContent = 'Refreshing…'; set(LINE); setTimeout(() => location.reload(), 350); }
      else if (pull) reset();
    }, { passive: true });
  })();

  // ---- Loading screen (#ssload in page.html): fades once Home has its data (games and the first cards drawn).
  // After 5 s it says it's still working; after 12 s it gets out of the way whatever happens.
  (() => {
    const ld = document.getElementById('ssload'); if (!ld) return;
    const t0 = Date.now(); let gone = false;
    const hide = () => { if (gone) return; gone = true; ld.classList.add('done'); setTimeout(() => ld.remove(), 450); };
    const ready = () => { const d = dash.data('games'); const drawn = document.querySelector('#hgotn [data-draw] > *, .hstrip > *, #pgrid > *'); return d && d.status !== 'loading' && !!drawn; };
    const tick = () => {
      if (gone) return;
      const ms = Date.now() - t0;
      if (ready() && ms > 400) return hide();
      if (ms > 5000) { const m = document.getElementById('ssloadmsg'); if (m) m.textContent = navigator.onLine === false ? 'You look offline. Showing what we have…' : 'Still loading… slow connection?'; }
      if (ms > 12000) return hide();
      setTimeout(tick, 150);
    };
    tick();
  })();
  const { el, rows, badge, bdX } = X;
  const MIN_PRICE = 1.4;
  const phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const q = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - q : q; };
  const amDec = (s) => { const m = String(s || '').match(/([+-]\d+)\s*$/); if (!m) return null; const a = Number(m[1]); return Math.round((a > 0 ? 1 + a / 100 : 1 + 100 / -a) * 100) / 100; };
  const conf = (c) => (c >= 70 ? 'High' : c >= 60 ? 'Medium' : 'Low');
  const fmtPt = (p) => (p > 0 ? '+' + p : String(p));
  const SIG = { nba: { m: 14, t: 19 }, nfl: { m: 13.5, t: 13 } }; // NBA widened 10 Nov (season misses: margin SD 14.6, total 18.6)

  // Every bet we can rate for one NBA or NFL game: [{market, pick, chance, price, book, est}]
  function candidates(sp, id, day) {
    const odds = rows('odds').filter((o) => o.sp === sp && o.game === id);
    const out = [];
    let H, A, mh, proj, winP, posted, total, mlH, mlA;
    if (sp === 'nba') {
      const gs = rows('games').filter((x) => x.id === id), p = rows('pred').find((x) => x.id === id), g = gs.find((x) => x.date === day) || gs[gs.length - 1]; if (!p || !g) return []; // same teams can meet on back-to-back days
      [A, H] = String(g.matchup || '').split(' @ ');
      mh = (p.winner === g.home ? 1 : -1) * Number(p.margin || 0); proj = Number(p.proj_total);
      const pickHome = p.ml_pick === g.home; winP = { [H]: pickHome ? p.ml_final_prob : 100 - p.ml_final_prob, [A]: pickHome ? 100 - p.ml_final_prob : p.ml_final_prob };
      posted = p.posted_margin; total = Number(g.total);
      const pr = amDec(p.ml_price); mlH = pickHome ? pr : null; mlA = pickHome ? null : pr;
    } else {
      const g = rows('nflgames').find((x) => x.id === id); if (!g) return [];
      H = g.home_name; A = g.away_name; mh = Number(g.proj_home) - Number(g.proj_away); proj = Number(g.proj_total);
      winP = { [H]: g.home_pct, [A]: g.away_pct }; posted = g.spread_home != null ? -Number(g.spread_home) : null; total = Number(g.total);
      mlH = g.ml_home != null ? amDec((g.ml_home > 0 ? '+' : '') + g.ml_home) : null; mlA = g.ml_away != null ? amDec((g.ml_away > 0 ? '+' : '') + g.ml_away) : null;
    }
    const s = SIG[sp];
    // winner
    for (const [nm, us] of [[H, mlH], [A, mlA]]) {
      const au = odds.find((o) => o.market === 'Winner' && o.pick === nm + ' win');
      if (winP[nm] == null) continue;
      out.push({ market: 'Winner', pick: nm + ' win', chance: Number(winP[nm]), price: au ? au.price : us, book: au ? au.book : us ? 'DraftKings (US)' : null, est: !au && !us });
    }
    // spread: Australian lines if offered, else the posted line at a standard price
    const sps = odds.filter((o) => o.market === 'Spread');
    if (sps.length) sps.forEach((o) => { const home = o.pick.startsWith(H + ' '); const mT = home ? mh : -mh; out.push({ market: 'Spread', pick: o.pick, chance: 100 * phi((mT + Number(o.point)) / s.m), price: o.price, book: o.book }); });
    else if (posted != null && Number.isFinite(mh)) { const hc = 100 * phi((mh - posted) / s.m); const home = hc >= 50; out.push({ market: 'Spread', pick: (home ? H + ' ' + fmtPt(-posted) : A + ' ' + fmtPt(posted)), chance: home ? hc : 100 - hc, price: 1.91, book: null, est: true }); }
    // total
    const tts = odds.filter((o) => o.market === 'Total points');
    if (tts.length) tts.forEach((o) => { const ov = 100 * phi((proj - Number(o.point)) / s.t); out.push({ market: 'Total', pick: o.pick, chance: /^Over/.test(o.pick) ? ov : 100 - ov, price: o.price, book: o.book }); });
    else if (Number.isFinite(total) && Number.isFinite(proj)) { const ov = 100 * phi((proj - total) / s.t); out.push({ market: 'Total', pick: (ov >= 50 ? 'Over ' : 'Under ') + total, chance: Math.max(ov, 100 - ov), price: 1.91, book: null, est: true }); }
    return out.filter((c) => Number.isFinite(c.chance)).map((c) => ({ ...c, chance: Math.round(c.chance) }));
  }
  const pickMain = (list) => { const ok = list.filter((c) => c.price && c.price >= MIN_PRICE).sort((a, b) => b.chance - a.chance); return ok[0] || list.slice().sort((a, b) => (b.price || 0) - (a.price || 0))[0] || null; };
  const priceTxt = (c) => (PUB ? '' : !c.price ? 'no price yet' : (c.est ? '≈ $' : '$') + c.price.toFixed(2) + (c.book && !c.est ? ' · ' + c.book : c.est ? ' (estimated)' : ''));

  // Main play card for an NBA or NFL game page.
  // ---- NBA back-to-backs: which team plays the night before or after this game (from past results, the current
  // slate and the 30-day schedule), and which of the two games matters more (division > conference > other conference).
  const NBA_DIV = { ATL: 'SE', CHA: 'SE', MIA: 'SE', ORL: 'SE', WAS: 'SE', BOS: 'AT', BKN: 'AT', NYK: 'AT', PHI: 'AT', TOR: 'AT', CHI: 'CE', CLE: 'CE', DET: 'CE', IND: 'CE', MIL: 'CE',
    DEN: 'NW', MIN: 'NW', OKC: 'NW', POR: 'NW', UTA: 'NW', GSW: 'PA', LAC: 'PA', LAL: 'PA', PHX: 'PA', SAC: 'PA', DAL: 'SW', HOU: 'SW', MEM: 'SW', NOP: 'SW', SAS: 'SW' };
  const confOf = (t) => (['SE', 'AT', 'CE'].includes(NBA_DIV[t]) ? 'East' : NBA_DIV[t] ? 'West' : '');
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const dayNum = (key) => { const m = String(key || '').match(/(\d+) (\w{3})/); if (!m || MON[m[2]] == null) return null; const now = new Date(), sy = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1, mo = MON[m[2]]; return Math.round(Date.UTC(mo >= 6 ? sy : sy + 1, mo, Number(m[1])) / 864e5); };
  const nbaAll = () => {
    const out = new Map(), names = {};
    const add = (id, away, home, day, an, hn) => { if (!id || !day) return; if (an) names[away] = an; if (hn) names[home] = hn; const n = dayNum(day); if (n == null) return; out.set(id + '|' + n, { id, away, home, n, day }); };
    rows('history').filter((h) => (h.sport || 'nba') === 'nba').forEach((h) => add(h.id, h.away, h.home, normDayX(h.date), h.away_name, h.home_name));
    rows('schedule').filter((h) => (h.sport || 'nba') === 'nba').forEach((h) => add(h.id, h.away, h.home, normDayX(h.date), h.away_name, h.home_name));
    rows('games').forEach((g) => { const [an, hn] = String(g.matchup || '').split(' @ '); add(g.id, g.away, g.home, normDayX(g.date), an, hn); });
    return { list: [...out.values()], names };
  };
  const normDayX = (d) => String(d || '').replace(/^(\w+) 0(\d) /, '$1 $2 ').trim();
  const imp = (t, o) => (NBA_DIV[t] && NBA_DIV[t] === NBA_DIV[o] ? 3 : confOf(t) && confOf(t) === confOf(o) ? 2 : 1);
  const IMPT = { 3: 'a division rival', 2: 'a conference game', 1: 'an other-conference game' };
  function b2bInfo(id, day) {
    const { list, names } = nbaAll(), n = dayNum(day); if (n == null) return null;
    const g = list.find((x) => x.id === id && x.n === n); if (!g) return null;
    const on = (t, k) => list.find((x) => x.n === k && (x.away === t || x.home === t));
    const vs = (t, x) => (x.away === t ? 'at ' : 'vs ') + (names[x.away === t ? x.home : x.away] || (x.away === t ? x.home : x.away));
    return [g.away, g.home].map((t) => {
      const opp = t === g.away ? g.home : g.away, prev = on(t, n - 1), next = on(t, n + 1);
      const last = list.filter((x) => x.n < n && (x.away === t || x.home === t)).sort((a, b) => b.n - a.n)[0];
      return { t, name: names[t] || t, opp, tonight: imp(t, opp), prev: prev && { vs: vs(t, prev), imp: imp(t, prev.away === t ? prev.home : prev.away) }, next: next && { vs: vs(t, next), imp: imp(t, next.away === t ? next.home : next.away) }, rest: last ? n - last.n - 1 : null };
    });
  }
  function b2bCard(id, day) {
    const info = b2bInfo(id, day); if (!info || !info.some((x) => x.prev || x.next)) return null;
    const card = el('div', null, 'card b2bcard'); card.append(el('h2', 'Back-to-backs'));
    info.forEach((x) => {
      const p = el('p'); p.append(el('b', x.name + ': '));
      const bits = [];
      if (x.prev) {
        bits.push('2nd night of a back-to-back (played ' + x.prev.vs + ' last night, ' + IMPT[x.prev.imp] + ').');
        bits.push(x.tonight > x.prev.imp ? 'Tonight is the bigger game for them: ' + IMPT[x.tonight] + '.' : x.tonight < x.prev.imp ? 'Tonight matters less to them (' + IMPT[x.tonight] + '), on tired legs.' : 'Tonight is also ' + (x.tonight === 3 ? 'against a division rival' : IMPT[x.tonight]) + '.');
      }
      if (x.next) {
        bits.push((x.prev ? 'They also play tomorrow: ' : '1st night of a back-to-back: tomorrow ') + x.next.vs + ' (' + IMPT[x.next.imp] + ').');
        bits.push(x.next.imp > x.tonight ? 'Tomorrow matters more to them, so watch for rest or lighter minutes tonight.' : x.next.imp < x.tonight ? 'Tonight is the bigger game for them (' + IMPT[x.tonight] + ').' : (x.tonight === 3 ? 'Both games are against division rivals.' : 'Both games are ' + IMPT[x.tonight].replace(/^an? /, '') + 's.'));
      }
      if (!bits.length) bits.push('Not on a back-to-back' + (x.rest != null ? ' (' + x.rest + (x.rest === 1 ? ' day' : ' days') + ' of rest).' : '.'));
      p.append(document.createTextNode(bits.join(' '))); card.append(p);
    });
    return card;
  }

  function mainCard(sp, id, day) {
    const list = candidates(sp, id, day); const m = pickMain(list); if (!m) return null;
    const card = el('div', null, 'card gpcard');
    const hd = el('div', null, 'gphd'); hd.append(el('h2', 'Main play'));
    if (sp === 'nba' && day) { const tags = (b2bInfo(id, day) || []).filter((x) => x.prev).map((x) => el('span', 'B2B · 2nd night: ' + x.t, 'b2btag')); if (tags.length) { const tg = el('div', null, 'b2btags'); tg.append(...tags); hd.append(tg); } }
    card.append(hd);
    const top = el('div', null, 'gptop'); top.append(el('b', m.pick, 'gpk'), el('span', m.chance + '% chance · ' + conf(m.chance), 'gpp'), el('span', priceTxt(m), 'gppr' + (m.price < MIN_PRICE ? ' low' : '')));
    card.append(top);
    const safest = list.slice().sort((a, b) => b.chance - a.chance)[0];
    if (safest && safest !== m) card.append(el('p', 'Safest bet: ' + safest.pick + ' (' + safest.chance + '%, ' + priceTxt(safest) + ').', 'gpsafe'));
    const tiles = el('div', null, 'gpall');
    ['Winner', 'Spread', 'Total'].forEach((mk) => { const best = list.filter((c) => c.market === mk).sort((a, b) => b.chance - a.chance)[0]; if (!best) return; const d = el('div'); d.append(el('span', mk), el('b', best.pick), el('small', best.chance + '%' + (PUB ? '' : ' · ' + (best.price ? (best.est ? '≈$' : '$') + best.price.toFixed(2) : '–')))); tiles.append(d); });
    card.append(tiles);
    return card;
  }

  // Football: the goals main play already on the fixture.
  const fbMain = (x) => { const g = x.goals_play; return g ? { market: 'Goals', pick: g.pick, chance: g.pct, price: g.price, book: g.book, est: g.est } : null; };

  // ---- Best bets on Home: the strongest main plays for today (Sydney), or the next day with games.
  const dayKey = (d) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short' }).formatToParts(d).map((x) => [x.type, x.value])); return `${p.weekday} ${p.day} ${p.month}`; };
  function bestBets() {
    const items = [];
    rows('games').forEach((g) => { if (rows('pred').some((p) => p.id === g.id)) items.push({ sp: 'nba', id: g.id, day: g.date, match: g.matchup, time: g.time }); });
    rows('fixtures').forEach((f) => items.push({ sp: 'fb', id: f.id, day: String(f.time).split(',')[0], match: f.home + ' v ' + f.away, time: (String(f.time).split(', ')[1] || '').replace(' AEDT', ''), x: f }));
    rows('nflgames').forEach((g) => items.push({ sp: 'nfl', id: g.id, day: String(g.kick).split(',')[0], match: g.away_name + ' @ ' + g.home_name, time: String(g.kick).split(', ')[1] || '' }));
    const now = new Date();
    // Only games still to start: not graded or live in history, kick-off still ahead (Sydney time).
    const kickAt = (i) => { const m = String(i.day + ' ' + i.time).match(/(\d+) (\w{3}) (\d+:\d+) ?([ap]m)/i); return m ? new Date(Date.parse(`${m[1]} ${m[2]} ${now.getFullYear()} ${m[3]} ${m[4].toUpperCase()} GMT+1100`)) : null; };
    const done = new Set(rows('history').filter((h) => h.status === 'Final' || h.status === 'Live').map((h) => (h.sport || 'nba') + '|' + h.id + '|' + h.date));
    const ahead = items.filter((i) => !done.has(i.sp + '|' + i.id + '|' + i.day) && (() => { const k = kickAt(i); return !k || isNaN(k) || k.getTime() > now.getTime(); })());
    items.length = 0; items.push(...ahead);
    const aheadIds = new Set(ahead.map((i) => i.sp + '|' + i.id + '|' + i.day));
    // From 4 pm Sydney the card shows the next day's best bets (today's left-overs only if tomorrow has none).
    const hr = Number(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', hourCycle: 'h23' }).format(now)) % 24;
    // One day only: today, or tomorrow from 4 pm (or when today has nothing left). Never further ahead.
    const groups = [];
    for (const k of hr >= 16 ? [1, 0] : [0, 1]) {
      const key = dayKey(new Date(now.getTime() + k * 86400000));
      const today = items.filter((i) => i.day === key);
      const plays = today.map((i) => { const m = i.sp === 'fb' ? fbMain(i.x) : pickMain(candidates(i.sp, i.id, i.day)); return m ? { ...i, m } : null; }).filter((i) => i && i.m.price >= MIN_PRICE);
      // Our own milestone props (propPlays, prop finder) are hidden from Best bets (owner, 10 Nov): only bookie
      // props with real AU prices show. To bring them back: const props = propPlays(today.filter((i) => i.sp === 'nba'));
      const props = [];
      const bprops = bookPlays(key, aheadIds), alts = altPlays(key);
      if (plays.length || props.length || bprops.length || alts.length) { groups.push({ key, plays: [], props, bprops, alts: [] }); break; }
    }
    return groups;
  }
  // NBA player props with a real bookmaker line: in if he cleared it in 65%+ of his games this season (5+ games)
  // and the price is $1.40 or more. One side per player and stat.
  const PROP_MIN = 65, STAT_W = { PTS: 'points', REB: 'rebounds', AST: 'assists', '3PM': 'threes', PRA: 'pts + reb + ast' };
  // Prop finder (scripts/prop-finder.js): our own chance from the player's game logs; one row per player and
  // stat at the highest milestone we give 75%+. A bookmaker price is attached when a matching line is saved
  // (Mac only); otherwise the fair price is shown with ≈.
  // Bookmaker prop lines with real AU prices (propbook, Mac only: fetch-props.js then prop-finder.js): our
  // chance for the exact line at 65%+ and paying $1.30+. Bookies set main lines near 50/50, so 75%+ is rare.
  // With alternate lines (fetch-props.js --alt) there are plenty at 75%+; one per player and stat (the safest).
  const BOOK_MIN = 75, BOOK_PRICE = 1.3;
  // Public site (not this Mac): no market prices are shown, and the picks come from the cleaned public copies
  // (pubprops / pubalts / pubbets from export-public.js) because the private files never leave the Mac.
  // Prices, books and edges show on the public site too since the paid Odds API plan (13 Nov 2026).
  const PUB = false;
  const propSrc = () => (rows('propbook').length ? rows('propbook') : rows('pubprops').map((r) => ({ ...r, price: 0, pub: true })));
  const altSrc = () => (rows('altlines').length ? rows('altlines') : rows('pubalts').map((r) => ({ ...r, price: 0, pub: true })));
  // Alternate lines and totals (altlines, Mac only: fetch-alt-lines.js): our chance from the margin / total model
  // at 75%+ paying $1.30+; one per game, market and side (our highest chance).
  function altPlays(key) {
    const now = Date.now(), seen = new Set(), out = [];
    altSrc().filter((r) => r.day === key && num(r.our) >= BOOK_MIN && (r.pub || num(r.price) >= BOOK_PRICE) && new Date(r.kick).getTime() > now)
      .sort((a, b) => num(b.our) - num(a.our)).forEach((r) => {
        const k = r.sp + '|' + r.game + '|' + r.market + '|' + r.pick.replace(/ [-+]?[\d.]+$/, ''); if (seen.has(k)) return; seen.add(k);
        const time = new Date(r.kick).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).toUpperCase();
        out.push({ sp: r.sp, id: r.game, day: r.day, match: r.match, time, m: { market: 'Alt ' + r.market.toLowerCase(), pick: r.pick, chance: Math.round(num(r.our)), rank: num(r.our), price: num(r.price), book: r.book, est: false, hit: '' } });
      });
    return out;
  }
  // NBA and NFL (sp on each row); only games still to start; one line per player and stat (our highest chance).
  function bookPlays(key, aheadIds) {
    const now = Date.now(), seen = new Set(), out = [];
    propSrc().filter((r) => r.day === key && num(r.chance) >= BOOK_MIN && (r.pub || num(r.price) >= BOOK_PRICE) && (r.kick ? new Date(r.kick).getTime() > now : aheadIds.has((r.sp || 'nba') + '|' + r.game + '|' + r.day)))
      .sort((a, b) => num(b.chance) - num(a.chance)).forEach((r) => {
        const k = (r.sp || 'nba') + '|' + r.player + '|' + r.stat; if (seen.has(k)) return; seen.add(k);
        const g = rows('games').find((x) => x.id === r.game && x.date === r.day);
        const time = r.kick ? new Date(r.kick).toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).toUpperCase() : '';
        out.push({ sp: r.sp || 'nba', id: r.game, day: r.day, match: (r.sp || 'nba') === 'nba' && g ? g.matchup : r.game.replace('-', ' @ '), time, prop: true, m: { market: 'Prop', pick: r.pick, chance: Math.round(num(r.chance)), rank: num(r.chance), price: num(r.price), book: r.book, est: false, hit: r.hit, finder: r } });
      });
    return out;
  }
  function propPlays(nba) {
    const out = [], seen = new Set();
    rows('propfind').forEach((r) => {
      const g = nba.find((i) => i.id === r.game && i.day === r.day); if (!g) return;
      const book = rows('props').find((q) => q.game === r.game && q.player === r.player && q.stat === r.stat && num(q.line) === r.line - 0.5 && num(q.over) > 1);
      seen.add(r.player + '|' + r.stat);
      out.push({ ...g, prop: true, m: { market: 'Prop', pick: r.pick, chance: Math.round(num(r.chance)), rank: num(r.chance), price: book ? num(book.over) : num(r.fair), book: book ? book.over_book : '', est: !book, hit: r.hit, finder: r } });
    });
    return out;
  }
  // Older rule (bookmaker lines cleared 65%+ this season): replaced by the prop finder on 10 Nov after it
  // went 57/108; kept for reference.
  function propPlaysBook(nba) {
    const out = [];
    rows('props').forEach((q) => {
      const g = nba.find((i) => i.id === q.game); if (!g || !(num(q.n) >= 5)) return;
      const sides = [['Over', num(q.over), q.over_book, num(q.over_hit), num(q.over_pct)], ['Under', num(q.under), q.under_book, num(q.under_hit), num(q.under_pct)]]
        .filter(([, pr, , , pct]) => pct >= PROP_MIN && pr >= MIN_PRICE).sort((a, b) => b[4] - a[4]);
      if (!sides.length) return;
      const [side, price, book, hit, pct] = sides[0], n = num(q.n);
      out.push({ ...g, prop: true, m: { market: 'Prop', pick: q.player + ' ' + side.toLowerCase() + ' ' + q.line + ' ' + (STAT_W[q.stat] || q.stat), chance: pct, rank: Math.round((100 * (hit + 1)) / (n + 2)), price, book, est: false, hit: hit + '/' + n } });
    });
    return out;
  }
  // Price since we first saw it (valuelog, local only) and injury news on a player prop's player (troster).
  const vlMap = () => { const g = dash.data('valuelog'), gen = g.data; if (vlMap.gen !== gen) { vlMap.gen = gen; vlMap.m = new Map((Array.isArray(gen) ? gen : []).map((x) => [x.sp + '|' + x.game + '|' + x.day + '|' + x.pick, x])); } return vlMap.m; };
  const injOf = (sp, f) => { if (!f) return ''; const t = rows('troster').filter((x) => x.sp === sp); for (const tm of t) for (const i of tm.inj || []) if (String(i[0]) === String(f.pid) || (i[1] && i[1] === f.player)) return i[3] || ''; return ''; };
  const bbIcon = (i) => { const f = i.m.finder, ic = el('span', null, 'bbic');
    if (f && f.side && f.pid && X.avatar) { ic.classList.add('face'); ic.append(X.avatar(i.sp === 'nba' ? 'nba' : (X.AT_HS && X.AT_HS[i.sp]) || i.sp, f.pid, f.player)); } // player's headshot
    else if ((i.sp === 'nba' || i.sp === 'nfl') && /^[A-Z]+-[A-Z]+$/.test(i.id) && X.badge) {
      // the team we're backing (winner / line); a total backs no team, so it shows both
      const [a, h] = i.id.split('-'), bd = i.sp === 'nba' ? X.badge : X.bdX, [an, hn] = String(i.match || '').split(' @ '), pk = String(i.m.pick || '');
      const pick = an && pk.startsWith(an + ' ') ? a : hn && pk.startsWith(hn + ' ') ? h : null;
      if (pick) { ic.classList.add('one'); ic.append(bd(pick)); } else { ic.classList.add('two'); ic.append(bd(a), bd(h)); }
    }
    else { const src = window.TAB_ICONS && window.TAB_ICONS[i.sp]; if (src) { const im = document.createElement('img'); im.src = src; im.alt = ''; ic.append(im); } }
    return ic;
  };
  // Season hit rate of a player prop as a whole percent (hit string like "6/6"), or null.
  const hitPct = (i) => { const f = i.m.finder; const s = String((f && f.hit) || i.m.hit || ''); const m = s.match(/(\d+)\s*\/\s*(\d+)/); return m && +m[2] ? Math.round(100 * +m[1] / +m[2]) : null; };
  const bbRow = (i) => {
    const b = el('button', null, 'bbr'); b.type = 'button';
    const f = i.m.finder, ic = bbIcon(i);
    const sub = f ? `Hit ${f.hit} this season · avg ${f.avg}, last ${f.sp === 'nfl' ? 3 : 5} ${f.l5}${f.why && f.why.length ? ' · ' + f.why[0] : ''} · ${i.match}` : (i.m.hit ? 'Hit ' + i.m.hit + ' this season · ' : '') + i.match + (i.time ? ' · ' + i.time : '');
    const l = el('div', null, 'l'); l.append(el('b', i.m.pick), el('span', sub));
    const r = el('div', null, 'r'); const hp = hitPct(i); r.append(el('b', (hp == null ? i.m.chance : hp) + '%', 'c ' + conf(hp == null ? i.m.chance : hp)), el('span', PUB || !i.m.price ? '' : (i.m.est ? '≈$' : '$') + i.m.price.toFixed(2) + (i.m.book && !i.m.est ? ' ' + i.m.book.replace(' (AU)', '') : '')));
    const v = !i.m.est && vlMap().get(i.sp + '|' + i.id + '|' + i.day + '|' + i.m.pick);
    if (v && Math.abs(num(v.price0) - i.m.price) >= 0.02) { const up = i.m.price > num(v.price0); r.append(el('small', (up ? '▲' : '▼') + ' from $' + num(v.price0).toFixed(2), 'bbmv ' + (up ? 'up' : 'dn'))); }
    const nw = f && f.side ? newsOf(f.pid) : [];
    if (nw.length) { const tg = el('em', 'In the news · ' + ago(nw[0].published), 'bbnews'); tg.title = nw[0].headline; l.append(tg); }
    const inj = f && f.side ? injOf(i.sp, f) : '';
    if (inj) { l.append(el('em', /out/i.test(inj) ? 'Now listed OUT' : 'Injury news: ' + inj, 'bbinj')); b.classList.add(/out/i.test(inj) ? 'bbout' : 'bbq'); }
    b.append(ic, l, r); b.addEventListener('click', () => (f && f.side && window.SSPP ? window.SSPP.focus(i.sp, f.stat, f.line, f.player, f.pid) : X.openGame(i.sp, i.id, i.day)));
    return b;
  };
  // ---- Best bets for one game (its own tab on the game page): the game markets we rate, alt lines and player props
  // with the same rules as the Bets page (our chance 75%+ paying $1.30+ for alt lines and props).
  function gameBets(sp, id, day) {
    const card = el('div', null, 'card gbcard'); card.append(el('h2', 'Best stats'));
    if (!bbReady()) { card.append(skel(3)); return card; }
    const ahead = new Set([sp + '|' + id + '|' + day]);
    const hs = rows('history').find((h) => (h.sport || 'nba') === sp && h.id === id && nday(h.date) === nday(day)), lv = liveOf(sp, id, day);
    if ((hs && (hs.status === 'Final' || hs.status === 'Live')) || (lv && lv.state !== 'pre')) card.append(el('p', 'This game has started, These were the top stats before kick-off.', 'gbclosed'));
    const gr = sp === 'nba' ? rows('games').find((x) => x.id === id && x.date === day) : rows('nflgames').find((x) => x.id === id);
    const match = gr ? (sp === 'nba' ? gr.matchup : gr.away_name + ' @ ' + gr.home_name) : '';
    // game markets: only the side we favour (50%+) with a real price
    const plays = [], alts = [];
    const props = bookPlays(day, ahead).filter((i) => i.sp === sp && i.id === id);
    if (!plays.length && !alts.length && !props.length) { card.append(el('p', 'No player stats for this game yet. Lines are fetched at 8:15 am and 8:15 pm Sydney time.', 'muted')); return card; }
    const sec = (title, list, n) => {
      if (!list.length) return;
      card.append(el('div', title + ' · ' + list.length, 'bbday bbsub'));
      const box = el('div', null, 'gbrows'); list.slice(0, n).forEach((i) => box.append(bbRow(i))); card.append(box);
      if (list.length > n) { const more = el('button', 'Show all ' + list.length + ' ›', 'bbmore'); more.type = 'button'; more.addEventListener('click', (e) => { e.stopPropagation(); box.replaceChildren(...list.map(bbRow)); more.remove(); }); card.append(more); }
    };
    sec('Game markets', plays, 6);
    sec('Alt lines · our chance 75%+ at $1.30+', alts, 6);
    props.sort((a, b) => (hitPct(b) || 0) - (hitPct(a) || 0)); sec('Player props · season hit rate', props, 10);
    return card;
  }

  // ---- UFC: how the fight ends. Our own chance of each fighter winning by KO/TKO, submission or decision, with a
  // fair price (100 / chance) to compare against the bookies (method markets aren't in The Odds API).
  //   chance(A by method) = chance A wins (our pick %) x share of A's wins by that method, where the share blends
  //   A's own wins, B's losses (how B tends to lose) and the UFC base rates for the division (men / women).
  const UFC_BASE = { men: { ko: 0.33, sub: 0.19, dec: 0.48 }, women: { ko: 0.18, sub: 0.20, dec: 0.62 } };
  const UFC_PRIOR = 4; // base-rate weight, in fights: keeps short records sensible
  const ufcName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(c\)/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const ufcFightsOf = (name) => { const n = ufcName(name), r = rows('ufcp').find((x) => ufcName(x.name) === n); if (!r) return null; let f = r.f; if (typeof f === 'string') { try { f = JSON.parse(f); } catch (e) { f = []; } } return Array.isArray(f) ? f : []; };
  const mKey = (m) => (/KO|TKO/.test(m) ? 'ko' : /SUB|SUMISSION/.test(m) ? 'sub' : /DEC/.test(m) ? 'dec' : null);
  function ufcMethods(r) {
    if (!r || !r.a || !r.b || !r.pick_pct) return null;
    const fa = ufcFightsOf(r.a), fb = ufcFightsOf(r.b); if (!fa || !fb) return null;
    const base = UFC_BASE[/women/i.test(r.weight || '') ? 'women' : 'men'];
    const count = (fs, res) => { const c = { ko: 0, sub: 0, dec: 0 }; fs.forEach((x) => { const k = x[5] === res && mKey(String(x[6] || '')); if (k) c[k]++; }); return c; };
    const share = (wins, losses) => { const t = {}; let s = 0; ['ko', 'sub', 'dec'].forEach((k) => { t[k] = wins[k] + losses[k] + UFC_PRIOR * base[k]; s += t[k]; }); ['ko', 'sub', 'dec'].forEach((k) => { t[k] /= s; }); return t; };
    const pA = (r.pick === r.a ? r.pick_pct : 100 - r.pick_pct) / 100;
    const sA = share(count(fa, 'W'), count(fb, 'L')), sB = share(count(fb, 'W'), count(fa, 'L'));
    const nm = (x) => String(x).replace(/\s*\(c\)/, '').split(' ').slice(-1)[0];
    const LAB = { ko: 'KO/TKO', sub: 'Submission', dec: 'Decision' };
    const list = [];
    ['ko', 'sub', 'dec'].forEach((k) => { list.push({ who: nm(r.a), side: 'a', k, p: pA * sA[k] }); list.push({ who: nm(r.b), side: 'b', k, p: (1 - pA) * sB[k] }); });
    const card = el('div', null, 'card ufcm'); card.append(el('h2', 'How it ends'));
    card.append(el('p', 'Our chance of each result, from both fighters\' records (how each wins, how the other loses) and our pick. The fair price is what the bet is worth to us: if your bookie pays more, it\'s value.', 'muted'));
    const t = el('table', null, 'dtbl ufcmt'); const hr = el('tr'); ['Result', 'Our chance', 'Fair price'].forEach((h, j) => hr.append(el('th', h, j ? 'n' : ''))); t.append(hr);
    list.sort((x, y) => y.p - x.p).forEach((x) => { const tr = el('tr', null, 'side-' + x.side); tr.append(el('td', x.who + ' by ' + LAB[x.k]), el('td', Math.round(x.p * 100) + '%', 'n'), el('td', x.p > 0.005 ? '$' + (1 / x.p).toFixed(2) : '–', 'n')); t.append(tr); });
    const w = el('div', null, 'scroll'); w.append(t); card.append(w);
    const fin = list.filter((x) => x.k !== 'dec').reduce((s2, x) => s2 + x.p, 0);
    card.append(el('p', 'Goes the distance (any decision): ' + Math.round((1 - fin) * 100) + '% · fair $' + (1 / Math.max(0.01, 1 - fin)).toFixed(2) + '. Ends inside the distance: ' + Math.round(fin * 100) + '% · fair $' + (1 / Math.max(0.01, fin)).toFixed(2) + '.', 'muted'));
    return card;
  }

  // UFC fight page: the breakdown split into tabs (Tape / Striking & grappling / Odds / Fight record); the tab picked is
  // kept per fight while the page redraws, and a fight opened fresh starts on Tape.
  const UFT = window.UFT = {};

  // ---- UFC finished fights: Result, All stats, Round by round (ufcdetail.json from fetch-ufc-detail.js; falls back to the live feed)
  const UFN = (n) => String(n || '').replace(/\s*\(c\)/, '');
  const ufcDetail = (r) => rows('ufcdetail').find((x) => x.id === r.id) || null;
  const ufcFinal = (r) => (r.status === 'Final' && !!r.result) || ((ufcLive(r) || {}).state === 'post');
  const ufcWinner = (r, d) => { const lr = ufcLive(r); let w = r.result || (d && d.winner) || ''; if (!w && lr && lr.state === 'post') { try { w = (JSON.parse(lr.extra || '{}') || {}).winner || ''; } catch (e) { w = ''; } } return w; };
  const mmss = (v) => { v = Math.round(Number(v) || 0); return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); };
  // Stats for one fighter: from the stored detail, else from the live feed rows.
  const ufcSideStats = (r, d, nm) => {
    if (d) { const s = nm === r.a ? d.a : d.b; if (s && s.stats && Object.keys(s.stats).length) return s.stats; }
    const lr = ufcLive(r); if (!lr) return null;
    const b = liveRows('livebox').find((q) => q.sport === 'ufc' && String(q.espn_id) === String(lr.espn_id) && nsim(q.player, nm)); if (!b) return null;
    try { return JSON.parse(b.stats || '{}'); } catch (e) { return null; }
  };
  const statRows = (A, B) => {
    const g = (S, k) => Number(S[k] || 0);
    const tgt = (S, x, suf) => g(S, 'sigDistance' + x + 'Strikes' + suf) + g(S, 'sigClinch' + x + 'Strikes' + suf) + g(S, 'sigGround' + x + 'Strikes' + suf);
    const la = (L, T) => (S) => g(S, L) + ' of ' + g(S, T), pc = (L, T) => (S) => (g(S, T) ? Math.round(100 * g(S, L) / g(S, T)) + '%' : '–');
    const defs = [
      ['Knockdowns', (S) => String(g(S, 'knockDowns')), (S) => g(S, 'knockDowns')],
      ['Significant strikes', la('sigStrikesLanded', 'sigStrikesAttempted'), (S) => g(S, 'sigStrikesLanded')],
      ['Significant strike accuracy', pc('sigStrikesLanded', 'sigStrikesAttempted'), (S) => (g(S, 'sigStrikesAttempted') ? g(S, 'sigStrikesLanded') / g(S, 'sigStrikesAttempted') : 0)],
      ['Total strikes', la('totalStrikesLanded', 'totalStrikesAttempted'), (S) => g(S, 'totalStrikesLanded')],
      ['Head', (S) => tgt(S, 'Head', 'Landed') + ' of ' + tgt(S, 'Head', 'Attempted'), (S) => tgt(S, 'Head', 'Landed')],
      ['Body', (S) => tgt(S, 'Body', 'Landed') + ' of ' + tgt(S, 'Body', 'Attempted'), (S) => tgt(S, 'Body', 'Landed')],
      ['Leg', (S) => tgt(S, 'Leg', 'Landed') + ' of ' + tgt(S, 'Leg', 'Attempted'), (S) => tgt(S, 'Leg', 'Landed')],
      ['Distance', (S) => ['Head', 'Body', 'Leg'].reduce((t, x) => t + g(S, 'sigDistance' + x + 'StrikesLanded'), 0) + ' of ' + ['Head', 'Body', 'Leg'].reduce((t, x) => t + g(S, 'sigDistance' + x + 'StrikesAttempted'), 0), (S) => ['Head', 'Body', 'Leg'].reduce((t, x) => t + g(S, 'sigDistance' + x + 'StrikesLanded'), 0)],
      ['Clinch', (S) => ['Head', 'Body', 'Leg'].reduce((t, x) => t + g(S, 'sigClinch' + x + 'StrikesLanded'), 0) + ' of ' + ['Head', 'Body', 'Leg'].reduce((t, x) => t + g(S, 'sigClinch' + x + 'StrikesAttempted'), 0), (S) => ['Head', 'Body', 'Leg'].reduce((t, x) => t + g(S, 'sigClinch' + x + 'StrikesLanded'), 0)],
      ['Ground', (S) => ['Head', 'Body', 'Leg'].reduce((t, x) => t + g(S, 'sigGround' + x + 'StrikesLanded'), 0) + ' of ' + ['Head', 'Body', 'Leg'].reduce((t, x) => t + g(S, 'sigGround' + x + 'StrikesAttempted'), 0), (S) => ['Head', 'Body', 'Leg'].reduce((t, x) => t + g(S, 'sigGround' + x + 'StrikesLanded'), 0)],
      ['Takedowns', la('takedownsLanded', 'takedownsAttempted'), (S) => g(S, 'takedownsLanded')],
      ['Submission attempts', (S) => String(g(S, 'submissions')), (S) => g(S, 'submissions')],
      ['Reversals', (S) => String(g(S, 'reversals')), (S) => g(S, 'reversals')],
      ['Control time', (S) => mmss(g(S, 'timeInControl')), (S) => g(S, 'timeInControl')],
    ];
    return defs.map(([lab, f, v]) => ({ lab, a: f(A), b: f(B), wa: v(A) > v(B), wb: v(B) > v(A) }));
  };
  const statCard = (nameA, nameB, rowsList) => {
    const card = el('div', null, 'fglive');
    const head = el('div', null, 'fglr fglnames'); head.append(el('b', UFN(nameA)), el('span', ''), el('b', UFN(nameB))); card.append(head);
    rowsList.forEach((x) => { const row = el('div', null, 'fglr'); row.append(el('b', x.a, x.wa ? 'win' : ''), el('span', x.lab), el('b', x.b, x.wb ? 'win' : '')); card.append(row); });
    return card;
  };
  function ufcResultPanes(r) {
    if (!ufcFinal(r)) return null;
    const d = ufcDetail(r), win = ufcWinner(r, d), lr = ufcLive(r);
    // Result
    const res = el('div', null, 'ufres');
    const hit = r.pick && win ? nsim(win, r.pick) : null;
    const draw = !win || /draw|no contest/i.test(win);
    res.append(el('div', draw ? 'Draw or no contest' : UFN(win) + ' won', 'ufwin'));
    const method = (d && d.method) || r.method || '';
    const rd = (d && d.round) || (lr && lr.period) || r.round, clk = (d && d.clock) || (lr && lr.clock) || r.clock;
    const facts = el('div', null, 'ftfacts');
    const tile = (v, l) => { const t = el('div'); t.append(el('b', v), el('span', l)); return t; };
    facts.append(tile(method || '–', 'How it ended'), tile(rd ? 'Round ' + rd + (d && d.scheduled_rounds ? ' of ' + d.scheduled_rounds : r.rounds ? ' of ' + r.rounds : '') : '–', 'Round'), tile(clk && clk !== '-' ? clk : '–', 'Time'), tile(r.weight || '–', 'Weight class'));
    res.append(facts);
    if (d && d.a && d.b && d.a.judges && d.a.judges.length === 3 && d.b.judges && d.b.judges.length === 3) {
      const cards = d.a.judges.map((x, i) => x + '-' + d.b.judges[i]).join(', ');
      res.append(el('p', 'Judges’ scorecards (' + UFN(r.a) + ' first): ' + cards, 'muted'));
    }
    if (r.pick) res.append(el('p', (hit === true ? '✓ ' : hit === false ? '✗ ' : '') + 'Our pick: ' + UFN(r.pick) + (r.pick_pct ? ' (' + Math.round(r.pick_pct) + '%, ' + (r.conf || '') + ')' : ''), 'ufpick ' + (hit === true ? 'hit' : hit === false ? 'miss' : '')));
    if (!d) res.append(el('p', 'Full stats and round details are added a few minutes after the fight ends.', 'muted'));
    // All stats
    const A = ufcSideStats(r, d, r.a), B = ufcSideStats(r, d, r.b);
    const all = el('div', null, 'ufall');
    if (A && B) all.append(statCard(r.a, r.b, statRows(A, B))); else all.append(el('p', 'Fight stats are added a few minutes after the fight ends.', 'muted'));
    // Round by round
    const rnd = el('div', null, 'ufrnd');
    const N = (d && d.round) || (lr && lr.period) || r.round || 0, rr = (d && d.rounds) || {};
    const LAB = { 'Knockdown': 'Knockdown', 'Takedown': 'Takedown', 'Takedown Attempt': 'Takedown attempt', 'Reversal': 'Reversal', 'Submission Attempt': 'Submission attempt' };
    if (!N) rnd.append(el('p', 'Round details are added a few minutes after the fight ends.', 'muted'));
    for (let k = 1; k <= N; k++) {
      const evs = (rr[k] || []).filter((q) => q.t !== 'Round End');
      const card = el('div', null, 'fglive ufround'); card.append(el('div', 'Round ' + k, 'fglh done'));
      const cnt = (t) => evs.filter((q) => q.t === t).length;
      const chips = [['Knockdown', 'knockdown'], ['Takedown', 'takedown'], ['Reversal', 'reversal']].map(([t, w]) => (cnt(t) ? cnt(t) + ' ' + w + (cnt(t) > 1 ? 's' : '') : '')).filter(Boolean);
      if (chips.length) card.append(el('p', chips.join(' · '), 'ufchips'));
      if (!evs.length) card.append(el('p', 'No knockdowns, takedowns or reversals logged.', 'muted'));
      evs.forEach((q) => { const row = el('div', null, 'fglr ufev'); row.append(el('b', q.clock || ''), el('span', LAB[q.t] || q.t), el('b', '')); card.append(row); });
      if (k === N && clk && clk !== '-') card.append(el('p', 'Fight ended at ' + clk + (method ? ' · ' + method : ''), 'muted'));
      rnd.append(card);
    }
    if (N) rnd.append(el('p', 'ESPN does not publish strikes per round. The fight totals are in All stats.', 'muted ufnote'));
    return { res, all, rnd };
  }

  // Past fight from a fighter's record: result and stats for both fighters, in a sheet over the page.
  function pastFight(nm, f) {
    const old = document.querySelector('.pfsheet'); if (old) old.remove();
    const sh = el('div', null, 'pfsheet'), card = el('div', null, 'pfcard');
    const x = el('button', '✕', 'pfx'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', () => sh.remove());
    sh.addEventListener('click', (e) => { if (e.target === sh) sh.remove(); });
    const res = f.res === 'W' ? 'won' : f.res === 'L' ? 'lost' : f.res === 'D' ? 'drew' : 'no contest';
    card.append(x, el('h3', UFN(nm) + ' ' + (f.res === 'W' ? 'beat ' : f.res === 'L' ? 'lost to ' : 'vs ') + f.opp));
    let when = f.date; try { when = new Date(f.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { /* keep raw */ }
    card.append(el('p', [f.event, when].filter(Boolean).join(' · '), 'muted'));
    const facts = el('div', null, 'ftfacts'); const tile = (v, l) => { const t = el('div'); t.append(el('b', v), el('span', l)); return t; };
    facts.append(tile(f.detail || f.method || '–', 'How it ended'), tile(f.round ? 'Round ' + f.round : '–', 'Round'), tile(f.clock || '–', 'Time'), tile(res, UFN(nm)));
    card.append(facts);
    const has = (f.sigA || 0) > 0 || (f.totA || 0) > 0 || (f.tdA || 0) > 0;
    if (has && f.ufc) {
      const hasO = f.oSigA != null;
      const rowsL = [];
      const w = (a, b) => [a > b, b > a];
      const add = (lab, a, b, va, vb) => { const [wa, wb] = w(va, vb); rowsL.push({ lab, a, b, wa, wb }); };
      add('Knockdowns', String(f.kd || 0), hasO ? String(f.oKd || 0) : '–', f.kd || 0, f.oKd || 0);
      add('Significant strikes', (f.sigL || 0) + ' of ' + (f.sigA || 0), hasO ? (f.oSigL || 0) + ' of ' + (f.oSigA || 0) : '–', f.sigL || 0, f.oSigL || 0);
      add('Total strikes', (f.totL || 0) + ' of ' + (f.totA || 0), '–', 0, 0);
      add('Takedowns', (f.tdL || 0) + ' of ' + (f.tdA || 0), hasO ? (f.oTdL || 0) + ' of ' + (f.oTdA || 0) : '–', f.tdL || 0, f.oTdL || 0);
      add('Submission attempts', String(f.sub || 0), '–', 0, 0);
      card.append(statCard(nm, f.opp, rowsL));
    } else card.append(el('p', f.ufc ? 'No stats recorded for this fight.' : 'Fights outside the UFC have the result, method and time only.', 'muted'));
    sh.append(card); document.body.append(sh);
  }

  function ufcTabs(r, G, recBox) {
    const fp = ufcResultPanes(r);
    const T = [...(fp ? [['res', 'Result', ''], ['all', 'All stats', ''], ['rnd', 'Round by round', '']] : []), ['tape', 'Tape', 'Side by side: the stronger number in each row is highlighted.'], ['fight', fp ? 'Career stats' : 'Stats', 'Career UFC rates. The stronger number in each row is highlighted.'], ['odds', 'Odds', ''], ['rec', 'Record', '']];
    const panes = {}, wrap = el('div', null, 'uftabs');
    T.forEach(([k, , note]) => {
      const p = el('div', null, 'ufpane'); if (note) p.append(el('p', note, 'muted'));
      if (k === 'odds') { const hm = ufcMethods(r); if (hm) p.append(hm); }
      if (G[k]) { const w = el('div', null, 'scr'); w.style.overflowX = 'auto'; w.append(G[k]); p.append(w); }
      if (k === 'rec' && recBox) p.append(recBox);
      if (fp && fp[k]) p.append(fp[k]);
      if (p.childNodes.length) panes[k] = p;
    });
    const bar = el('div', null, 'nfltabs uftabbar');
    const show = (k) => { UFT[r.id] = k; Object.entries(panes).forEach(([q, p]) => { p.hidden = q !== k; }); bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); };
    T.forEach(([k, l]) => { if (!panes[k]) return; const b = el('button', l); b.type = 'button'; b.dataset.k = k; b.addEventListener('click', (e) => { e.stopPropagation(); show(k); const top = wrap.getBoundingClientRect().top + scrollY - 70; if (scrollY > top) window.scrollTo(0, top); }); bar.append(b); });
    wrap.append(bar, ...Object.values(panes)); show(UFT[r.id] && panes[UFT[r.id]] ? UFT[r.id] : fp ? 'res' : 'tape');
    return wrap;
  }

  // Grey placeholder rows while data loads (instead of "Loading…").
  const skel = (n = 4) => { const w = el('div', null, 'skel'); w.setAttribute('aria-label', 'Loading'); for (let k = 0; k < n; k++) w.append(el('i')); return w; };
  const bbReady = () => ['games', 'pred', 'fixtures', 'odds', 'propfind', 'propbook', 'altlines'].every((d) => dash.data(d).status !== 'loading');
  dash.draw('bestbets', (box) => {
    if (!bbReady()) { box.replaceChildren(skel()); return; }
    const groups = bestBets(), g = groups[0];
    if (!g) { box.replaceChildren(el('p', 'No priced plays for today or tomorrow yet.', 'plnone')); return; }
    const out = [el('div', g.key, 'bbday')];
    if (g.plays.length) out.push(el('div', 'Game props', 'bbday bbsub'), ...g.plays.slice(0, 3).map(bbRow));
    if (g.alts && g.alts.length) out.push(el('div', 'Alt lines · our chance 75%+ at $1.30+', 'bbday bbsub'), ...g.alts.slice(0, 3).map(bbRow));
    if (g.bprops && g.bprops.length) out.push(el('div', 'Player props · our chance 75%+ at $1.30+', 'bbday bbsub'), ...g.bprops.slice(0, 3).map(bbRow));
    if (g.props.length) out.push(el('div', 'Player props · our chance 75%+', 'bbday bbsub'), ...g.props.slice(0, 3).map(bbRow));
    const n = groups.reduce((t, x) => t + x.plays.length + x.props.length + (x.bprops ? x.bprops.length : 0) + (x.alts ? x.alts.length : 0), 0);
    const more = el('button', 'See all ' + n + ' best stats ›', 'bbmore'); more.type = 'button';
    more.addEventListener('click', () => X.openBets()); out.push(more);
    box.replaceChildren(...out);
  });
  const BBF = (() => { try { return { sp: 'all', kind: 'all', hi: false, ...JSON.parse(localStorage.getItem('ss_bbf') || '{}') }; } catch (e) { return { sp: 'all', kind: 'all', hi: false }; } })();
  // Best stats page: player stats by season hit rate.
  dash.draw('bestall', (box) => {
    if (!bbReady()) { box.replaceChildren(skel()); return; }
    const groups0 = bestBets();
    if (!groups0.length) { box.replaceChildren(el('p', 'No priced plays for today or tomorrow yet.', 'plnone')); return; }
    // Filter chips: sport, kind of bet, 80%+ only (remembered in this browser).
    const sps = [...new Set(groups0.flatMap((g) => [...g.plays, ...(g.alts || []), ...(g.bprops || [])].map((i) => i.sp)))];
    if (BBF.sp !== 'all' && !sps.includes(BBF.sp)) BBF.sp = 'all';
    const keep = (i) => (BBF.sp === 'all' || i.sp === BBF.sp) && (!BBF.hi || (hitPct(i) == null ? i.m.chance : hitPct(i)) >= 80);
    const groups = groups0.map((g) => ({ ...g, plays: BBF.kind === 'player' ? [] : g.plays.filter(keep), alts: BBF.kind === 'player' ? [] : (g.alts || []).filter(keep), bprops: BBF.kind === 'game' ? [] : (g.bprops || []).filter(keep) }));
    const chips = el('div', null, 'bbchips');
    const chip = (lab, on, fn) => { const c = el('button', lab, 'bbchip' + (on ? ' on' : '')); c.type = 'button'; c.addEventListener('click', () => { fn(); try { localStorage.setItem('ss_bbf', JSON.stringify(BBF)); } catch (e) { /* not kept */ } dash.draw('bestall'); }); return c; };
    const SPN = { nba: 'NBA', nfl: 'NFL', fb: 'Football' };
    if (sps.length > 1) { chips.append(chip('All sports', BBF.sp === 'all', () => { BBF.sp = 'all'; })); sps.forEach((x) => chips.append(chip(SPN[x] || x.toUpperCase(), BBF.sp === x, () => { BBF.sp = x; }))); chips.append(el('i', null, 'bbsep')); }
    chips.append(chip('80%+ hit rate', BBF.hi, () => { BBF.hi = !BBF.hi; }));
    const out = [chips];
    if (!groups.some((g) => g.plays.length || g.alts.length || g.bprops.length)) out.push(el('p', 'Nothing matches these filters.', 'plnone'));
    groups.forEach((g) => {
      out.push(el('div', g.key, 'bbday'));
      if (g.plays.length) { out.push(el('div', 'Game props · ' + g.plays.length, 'bbday bbsub'), el('p', 'Winner, line and total for each game: our best play at $1.40 or more.', 'muted bbnote')); out.push(...g.plays.map(bbRow)); }
      if (g.alts && g.alts.length) { out.push(el('div', 'Alt lines · ' + g.alts.length, 'bbday bbsub'), el('p', 'Alternate lines and totals from AU bookies (e.g. a bigger start than the main line) where our margin / total model gives 75%+ and the price is $1.30+, one per game and side. Uses the spread of real results this season (margins miss our projection by about 14 points, totals by 19).', 'muted bbnote')); out.push(...g.alts.map(bbRow)); }
      if (g.bprops && g.bprops.length) {
        // Player props in their own drop-down, best season hit rate first (then our chance).
        const hr = (i) => { const m = String(i.m.hit || '').match(/(\d+)\/(\d+)/); return m && +m[2] ? +m[1] / +m[2] : 0; };
        // Game picker: all games, or one game's best props (tap a game).
        const gms = [...new Map(g.bprops.map((i) => [i.sp + '|' + i.id, i])).values()].sort((a, b) => String(a.time).localeCompare(String(b.time)));
        if (BBF.game && !gms.some((i) => i.sp + '|' + i.id === BBF.game)) BBF.game = '';
        const list = g.bprops.filter((i) => !BBF.game || i.sp + '|' + i.id === BBF.game).sort((a, b) => hr(b) - hr(a) || b.m.rank - a.m.rank);
        const gchips = el('div', null, 'bbchips bbgames');
        if (gms.length > 1) { gchips.append(chip('All games', !BBF.game, () => { BBF.game = ''; BBF.pOpen = true; }));
          gms.forEach((i) => { const k = i.sp + '|' + i.id, n = g.bprops.filter((x) => x.sp + '|' + x.id === k).length; gchips.append(chip(i.id.replace('-', ' @ ') + ' · ' + n, BBF.game === k, () => { BBF.game = BBF.game === k ? '' : k; BBF.pOpen = true; })); }); }
        const d = el('details', null, 'bbdrop'); if (BBF.kind === 'player' || BBF.pOpen) d.open = true; d.addEventListener('toggle', () => { BBF.pOpen = d.open; }); const sm = el('summary'); sm.append(el('b', 'Player props · best hit rate'), el('span', String(list.length), 'muted'));
        d.append(sm, ...(gms.length > 1 ? [gchips] : []), el('p', 'Real Australian bookie lines (NBA and NFL) where our chance is 75%+ and the price is $1.30+, one per player and stat, sorted by how often he has cleared it this season. Our chance comes from his game logs; tested on this season, lines we rate 75%+ hit about 80% (NBA) and 77-91% (NFL). A big gap to the bookie can mean they know something (minutes, late injury news). Tap one to open the player.', 'muted bbnote'), ...list.map(bbRow));
        out.push(d);
      }
      if (g.props.length) { const top = g.props.slice(0, 30); out.push(el('div', 'Player props · ' + g.key + ' · top ' + top.length + ' of ' + g.props.length, 'bbday bbsub'), el('p', 'Our chance from each player\'s game logs: season average plus recent form, out players removed. Tested on every game day this season using only earlier games: plays at 75%+ hit 81%. ≈ is our fair price (no bookmaker line saved); take it only if the bookie pays more. Reasons like home/away or the opponent are shown but did not improve the chance in testing, so they do not move it.', 'muted bbnote')); out.push(...top.map(bbRow)); }
    });
    box.replaceChildren(...out);
  });

  // ---- Track record (Review, local only): every bet we rated (valuelog, value-log.js), settled from results.
  // Did our 70% / 80% picks really win that often, and would $1 on each have made money?
  dash.draw('trackrec', (box) => {
    const sec = box.closest('section'); const g = dash.data('valuelog');
    const all = g.status === 'ok' && Array.isArray(g.data) ? g.data : [];
    const done = all.filter((x) => x.status === 'won' || x.status === 'lost');
    if (sec) sec.classList.toggle('isempty', !all.length); if (!all.length) { box.replaceChildren(); return; }
    const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
    const sum = (a) => { const w = a.filter((x) => x.status === 'won').length, pnl = a.reduce((t, x) => t + (x.status === 'won' ? num(x.price) - 1 : -1), 0), said = a.length ? a.reduce((t, x) => t + num(x.our), 0) / a.length : 0; return { n: a.length, w, pnl, said }; };
    const days = new Set(done.map((x) => x.day)).size, open = all.length - done.length - all.filter((x) => x.status === 'void').length;
    const out = [el('p', done.length ? `${done.length} bets settled over ${days} ${days === 1 ? 'day' : 'days'} (${open} still to play). Each is every line we rated, at the last Australian price before the game, as if $1 went on it.` : `${open} bets saved, none settled yet. Results come in after each game (player props the next day).`, 'muted bbnote')];
    if (!done.length) { box.replaceChildren(...out); return; }
    // one row per kind of bet, and the Best bets rule on its own line
    const T = el('div', null, 'trk');
    const row = (lab, a, sub) => { const x = sum(a); if (!x.n) return; const r = el('div', null, 'trr' + (sub ? ' sub' : '')); const wp = pct(x.w, x.n), d = wp - Math.round(x.said);
      r.append(el('b', lab), el('span', x.n + ' bets'), el('span', 'won ' + wp + '%', d >= -3 ? 'up' : d <= -8 ? 'dn' : ''), el('span', 'we said ' + Math.round(x.said) + '%', 'muted'), el('span', money(x.pnl), x.pnl > 0 ? 'up' : x.pnl < 0 ? 'dn' : '')); T.append(r); };
    const BB = (x) => x.our >= 75 && num(x.price) >= 1.3;
    [['game', 'Game picks'], ['alt', 'Alt lines'], ['prop', 'Player props']].forEach(([k, lab]) => { const a = done.filter((x) => x.src === k); row(lab, a); row('Best bets only (75%+, $1.30+)', a.filter(BB), true); });
    out.push(T);
    // calibration: what we said against what happened, by chance band (all kinds together)
    out.push(el('div', 'When we said… it won', 'mbsec'));
    const C = el('div', null, 'trcal');
    [[50, 60], [60, 70], [70, 80], [80, 90], [90, 101]].forEach(([lo, hi]) => {
      const a = done.filter((x) => x.our >= lo && x.our < hi); if (!a.length) return; const x = sum(a), wp = pct(x.w, x.n);
      const r = el('div', null, 'trcr'); const tr = el('div', null, 'trbar'); const f = el('i', null, wp >= Math.round(x.said) - 3 ? 'up' : 'dn'); f.style.width = wp + '%'; const m = el('em'); m.style.left = Math.round(x.said) + '%'; tr.append(f, m);
      r.append(el('span', lo + '–' + (hi > 100 ? 100 : hi) + '%'), tr, el('b', wp + '%'), el('small', x.n + '')); C.append(r);
    });
    out.push(C, el('p', 'Bar = how often it won; the tick = what we said. Bars past the tick mean we were too careful, short of it too confident. A few days of results swing a lot: judge it after a few weeks.', 'muted bbnote'));
    box.replaceChildren(...out);
  });

  // ---- My bets in Review: bets the owner logs in chat (dataset bets), settled from results.
  // ---- My bets: open bets on Home; once settled they move to Review with a profit / loss bar.
  const num = (x) => Number(x || 0);
  const isBonus = (b) => b.bonus === true || b.bonus === 'true';
  const money = (v) => (Math.abs(v) < 0.005 ? '$0.00' : (v > 0 ? '+$' : '−$') + Math.abs(v).toFixed(2));
  // Bonus bets: a win pays the winnings only, a loss costs nothing.
  const profitOf = (b) => (b.status === 'won' ? num(b.stake) * (num(b.price) - 1) : b.status === 'lost' ? (isBonus(b) ? 0 : -num(b.stake)) : 0);
  const betRows = () => { const g = dash.data('bets'); return g.status === 'ok' && Array.isArray(g.data) ? g.data.filter((b) => b.status !== 'placeholder') : []; };
  const isOpen = (b) => !b.status || b.status === 'open';
  // The live app may hand nested lists over as text or as an object: always give an array of legs (or null).
  const legsOf = (b) => { let l = b && b.legs; if (l == null || l === '') return null; if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { return null; } } if (!Array.isArray(l)) l = typeof l === 'object' ? Object.values(l) : null; return l && l.length ? l : null; };
  // Stats for the Home corner: bets placed, record of settled bets, profit (settled) and cash still running.
  const betStats = () => {
    const all = betRows(), settled = all.filter((b) => b.status === 'won' || b.status === 'lost');
    const won = settled.filter((b) => b.status === 'won').length;
    return { n: all.length, won, lost: settled.length - won, profit: settled.reduce((s, b) => s + profitOf(b), 0), running: all.filter((b) => isOpen(b) && !isBonus(b)).reduce((s, b) => s + num(b.stake), 0) };
  };

  // ---- Accounts: sign in / create account (Cloudflare Pages Functions at /api, see functions/api). The header shows a
  // Sign in button, or the member's name once signed in. Only the live site has the API; elsewhere nothing shows.
  const ACC = { user: null, ready: false, setup: false };
  const accJson = (url, body) => fetch(url, { method: body ? 'POST' : 'GET', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json().then((j) => ({ ok: r.ok, j }))).catch(() => ({ ok: false, j: { error: 'No connection. Try again.' } }));
  const accLoad = () => fetch('/api/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => { ACC.ready = true; ACC.setup = !!(j && j.setup); ACC.user = (j && j.user) || null; welcomeSync(); try { dash.draw('appbar'); } catch (e) { /* not drawn yet */ } }).catch(() => { ACC.ready = true; });
  const accClose = () => { const s = document.querySelector('.accsheet'); if (s) s.remove(); };
  function accOpen(mode) {
    accClose();
    let tab = mode || 'in';
    const sh = el('div', null, 'accsheet'), card = el('div', null, 'acccard');
    sh.addEventListener('click', (e) => { if (e.target === sh) accClose(); });
    const x = el('button', '✕', 'pfx'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', accClose);
    const form = el('form', null, 'accform'); form.noValidate = true;
    const draw = () => {
      form.replaceChildren();
      const tabs = el('div', null, 'acctabs');
      [['in', 'Sign in'], ['up', 'Create account']].forEach(([k, l]) => { const b = el('button', l, tab === k ? 'on' : ''); b.type = 'button'; b.addEventListener('click', () => { tab = k; draw(); }); tabs.append(b); });
      form.append(tabs);
      const field = (id, label, type, ph, ac) => { const w = el('label', null, 'accf'); w.setAttribute('for', id); const i = el('input'); i.id = id; i.name = id; i.type = type; i.placeholder = ph || ''; i.autocomplete = ac; i.setAttribute('autocapitalize', 'none'); i.setAttribute('autocorrect', 'off'); w.append(el('span', label), i); return w; };
      if (tab === 'up') form.append(field('acc-name', 'Your name', 'text', 'Shown at the top of the app', 'name'));
      form.append(field('acc-email', 'Email', 'email', 'you@example.com', 'email'));
      form.append(field('acc-pass', 'Password', 'password', tab === 'up' ? 'At least 10 characters' : '', tab === 'up' ? 'new-password' : 'current-password'));
      if (tab === 'up') { form.append(field('acc-invite', 'Invite code', 'text', 'From the person who invited you', 'off')); form.append(el('p', 'By creating an account you confirm you are 18 or over.', 'muted accnote')); }
      const err = el('p', '', 'accerr'); err.setAttribute('role', 'alert'); form.append(err);
      const go = el('button', tab === 'up' ? 'Create account' : 'Sign in', 'accgo'); go.type = 'submit'; form.append(go);
      form.onsubmit = async (e) => {
        e.preventDefault(); err.textContent = ''; go.disabled = true;
        const v = (id) => (form.querySelector('#' + id) || {}).value || '';
        const res = tab === 'up' ? await accJson('/api/signup', { email: v('acc-email'), name: v('acc-name'), password: v('acc-pass'), invite: v('acc-invite') }) : await accJson('/api/login', { email: v('acc-email'), password: v('acc-pass') });
        go.disabled = false;
        if (!res.ok) { err.textContent = (res.j && res.j.error) || 'Something went wrong. Try again.'; return; }
        ACC.user = res.j.user; accClose(); welcomeSync(); try { dash.draw('appbar'); } catch (e2) { /* ignore */ }
      };
    };
    draw(); card.append(x, el('h3', 'IQVerdict'), form); sh.append(card); document.body.append(sh);
    const first = form.querySelector('input'); if (first) first.focus();
  }
  function accMenu() {
    accClose();
    const sh = el('div', null, 'accsheet'), card = el('div', null, 'acccard small');
    sh.addEventListener('click', (e) => { if (e.target === sh) accClose(); });
    const x = el('button', '✕', 'pfx'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', accClose);
    const out = el('button', 'Sign out', 'accgo'); out.type = 'button';
    out.addEventListener('click', async () => { out.disabled = true; await accJson('/api/logout', {}); ACC.user = null; accClose(); welcomeSync(); try { dash.draw('appbar'); } catch (e) { /* ignore */ } });
    card.append(x, el('h3', ACC.user.name), el('p', 'You are signed in.', 'muted'), out); sh.append(card); document.body.append(sh);
  }

  // ---- Welcome page: what signed-out visitors see first when this site has accounts (a scrolling landing page).
  // Everything on it is our own artwork with example numbers (marked "Example"), so nothing stale or licensed shows here.
  const MARK = '<svg viewBox="0 0 512 512" aria-hidden="true"><rect x="141" y="116" width="40" height="176" rx="2" fill="#fff"/><ellipse cx="283" cy="204" rx="64" ry="68" fill="none" stroke="#fff" stroke-width="40"/><path d="M324 246 364 292" stroke="#fff" stroke-width="34"/><path d="M156 346 256 418 356 346" fill="none" stroke="#1fd56b" stroke-width="22" stroke-linejoin="miter" stroke-linecap="butt"/></svg>';
  function welcomeSync() {
    const on = ACC.ready && ACC.setup && !ACC.user, cur = document.querySelector('.welcome');
    document.documentElement.classList.toggle('wl-on', on);
    if (!on) { if (cur) cur.remove(); return; }
    if (cur) return;
    const W = el('div', null, 'welcome'), go = (m) => () => accOpen(m);
    const btn = (t, cls, fn) => { const b = el('button', t, cls); b.type = 'button'; b.addEventListener('click', fn); return b; };
    const chart = (vals, line) => { const mx = Math.max(...vals, line) * 1.12, w = el('div', null, 'wlchart'); vals.forEach((v) => { const c = el('div', null, 'wlcol'), b = el('i', null, v > line ? 'hit' : 'miss'); b.style.height = Math.round(v / mx * 100) + '%'; c.append(b, el('span', String(v))); w.append(c); }); const ln = el('div', null, 'wlline'); ln.style.bottom = 'calc(' + Math.round(line / mx * 100) + '% * .78 + 22px)'; ln.append(el('b', String(line))); w.append(ln); return w; };
    const circ = (t, on2) => el('span', t, 'wlpc' + (on2 ? ' on' : ''));
    const face = (dir, id, t, on2) => { const s = el('span', null, 'wlpc wlface' + (on2 ? ' on' : '')), im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer'; im.onerror = () => { im.remove(); s.textContent = t; }; im.src = 'https://a.espncdn.com/combiner/i?img=/i/headshots/' + dir + '/players/full/' + id + '.png&w=160&h=116&scale=crop&cquality=90'; s.append(im); return s; };
    const logo = (code, t) => { try { if (X.badge) { const b = X.badge(code); b.classList.add('wllg'); return b; } } catch (e) { /* fall back to letters */ } return el('span', t, 'wltb'); };
    const tb = (t) => el('span', t, 'wltb');
    const nameCell = (nm, id, ini, dot) => { const w = el('span', null, 'wlnm'); if (dot) w.append(el('i', null, 'ocdot')); w.append(face('nba', id, ini), el('span', nm)); return w; };
    const feature = (flip, kicker, title, text, mock) => { const s = el('section', null, 'wlfeat' + (flip ? ' flip' : '')), tx = el('div', null, 'wlft'); tx.append(el('span', kicker, 'wlkick'), el('h2', title), el('p', text)); const pan = el('div', null, 'wlpanel'); pan.append(mock, el('small', 'Example data', 'wlex')); s.append(tx, pan); return s; };

    // top bar
    const bar = el('header', null, 'wlbar'), brand = el('div', null, 'wlbrand'), lg = el('div', null, 'wllogo'); lg.innerHTML = MARK; brand.append(lg, el('b', 'IQVerdict'));
    const acts = el('div', null, 'wlbtns'); acts.append(btn('Log in', 'wlalt sm', go('in')), btn('Create account', 'wlgo sm', go('up'))); bar.append(brand, acts);

    // hero
    const hero = el('section', null, 'wlhero'), ht = el('div', null, 'wlht');
    const live = el('span', null, 'wlpill'); live.append(el('i'), document.createTextNode('NBA · NFL · Football · UFC'));
    ht.append(live, el('h1', 'Know the numbers behind every game.'), el('p', 'Live box scores, player hit rates, defence and matchup stats in one place. No picks. No tips. You make your own calls.', 'wlsub'));
    const ca = el('div', null, 'wlact'); ca.append(btn('Create account', 'wlgo', go('up')), btn('Log in', 'wlalt', go('in'))); ht.append(ca, el('p', 'Invite only while we are in beta. Free to join.', 'wlnote'));
    const hv = el('div', null, 'wlpanel hero');
    const gm = el('div', null, 'wlgame'); gm.append(el('div', null, 'wlteam'), el('div', null, 'wlteam'));
    const g1 = el('div', null, 'wlteam'); g1.append(logo('LAL', 'LAL'), el('b', 'Lakers'), el('b', '98', 'wlsc')); const g2 = el('div', null, 'wlteam'); g2.append(logo('SAS', 'SAS'), el('b', 'Spurs'), el('b', '96', 'wlsc'));
    const gst = el('div', null, 'wlstate'); gst.append(el('span', null, 'wllive'), document.createTextNode('LIVE · 1:12 · 4TH'));
    gm.replaceChildren(g1, gst, g2);
    const tbl = el('table', null, 'wlmini'); [['Player', 'MIN', 'PTS', 'REB', 'AST'], ['L. Doncic', '36', '38', '9', '11', '3945274', 'LD', 1], ['V. Wembanyama', '35', '31', '14', '3', '5104157', 'VW', 1], ['A. Reaves', '33', '24', '4', '6', '4066457', 'AR'], ['D. Fox', '32', '19', '3', '7', '4066259', 'DF']].forEach((r, i) => { const tr = el('tr'); r.slice(0, 5).forEach((c, j) => { const t = el(i ? 'td' : 'th'); if (i && !j) t.append(nameCell(c, r[5], r[6], r[7])); else t.append(document.createTextNode(c)); tr.append(t); }); tbl.append(tr); });
    hv.append(gm, tbl, el('small', 'Example data', 'wlex')); hero.append(ht, hv);

    // feature showcases
    const f1 = feature(false, 'Hit rates', 'See how often it actually happens', 'Every player stat shows the season hit rate next to the last ten games, so you can judge any line for yourself.', (() => { const d = el('div'); const top = el('div', null, 'wlrow'); top.append(face('nba', '3945274', 'LD'), (() => { const x = el('div'); x.append(el('b', 'Luka Doncic · Points'), el('span', 'Line 30.5 · last 10 games', 'wlmuted')); return x; })(), el('b', '7/10 · 70%', 'wlhit')); d.append(top, chart([34, 29, 41, 27, 36, 33, 25, 38, 31, 35], 30.5)); return d; })());
    const f2 = feature(true, 'Live games', 'Follow it as it happens', 'Scores, quarter by quarter, full box scores and a red dot beside every player who is on the court right now.', (() => { const t2 = el('table', null, 'wlmini'); [['Player', 'MIN', 'PTS', 'REB', 'FG'], ['L. Doncic', '36', '38', '9', '13-25', '3945274', 'LD', 1], ['A. Reaves', '33', '24', '4', '8-16', '4066457', 'AR', 1], ['V. Wembanyama', '35', '31', '14', '11-19', '5104157', 'VW', 1], ['D. Fox', '32', '19', '3', '7-14', '4066259', 'DF']].forEach((r, i) => { const tr = el('tr'); r.slice(0, 5).forEach((c, j) => { const t = el(i ? 'td' : 'th'); if (i && !j) t.append(nameCell(c, r[5], r[6], r[7])); else t.append(document.createTextNode(c)); tr.append(t); }); t2.append(tr); }); return t2; })());
    const f3 = feature(false, 'Matchups and defence', 'Where the pressure comes from', 'Sacks, QB hits, tackles for loss and passes defended for every NFL team, plus points allowed by area of the court in the NBA.', (() => { const t3 = el('table', null, 'wlmini'); [['Defence', 'TKL', 'SACK', 'TFL', 'QB HIT', 'PD'], ['P. Queen', '14', '1', '1', '2', '0'], ['P. Wilson', '17', '0', '0', '0', '1'], ['J. Brisker', '10', '0', '0', '1', '0'], ['Team', '73', '3', '4', '6', '5']].forEach((r, i, a) => { const tr = el('tr', null, i === a.length - 1 ? 'tot' : ''); r.forEach((c) => tr.append(el(i ? 'td' : 'th', c))); t3.append(tr); }); return t3; })());
    const f4 = feature(true, 'Fighters', 'Fight research without the guesswork', 'Side by side tale of the tape, career strike and takedown rates, the full record with a stat sheet for every past fight, and round by round events once it is over.', (() => { const d = el('div', null, 'wlfight'); const h = el('div', null, 'wlfh'); const a = el('div', null, 'wlfc'); a.append(face('mma', '4426000', 'CG', 1), el('b', 'Gane'), el('span', 'FRA', 'wlflag')); const m = el('b', 'VS', 'wlvs'); const b = el('div', null, 'wlfc'); b.append(face('mma', '4049391', 'JH'), el('b', 'Hokit'), el('span', 'USA', 'wlflag')); h.append(a, m, b); d.append(h); [['11-2', 'UFC record', '4-0'], ['81"', 'Reach', '73.5"'], ['5.4', 'Strikes landed / min', '6.1'], ['62%', 'Striking accuracy', '58%']].forEach(([x, l, y]) => { const r = el('div', null, 'wltape'); r.append(el('b', x, 'l'), el('span', l), el('b', y)); d.append(r); }); return d; })());

    // sports
    const SPORTS = [['NBA', ['Live scores and full box scores', 'Hit rates for points, rebounds, assists and threes', 'Team pages, rosters and injuries', 'Points allowed by court zone']], ['NFL', ['Live passing, rushing and receiving', 'Defence: sacks, QB hits, tackles for loss', 'Player prop hit rates', 'Team ratings and recent form']], ['Football', ['Premier League, La Liga and Champions League', 'Fixtures, form and head to head', 'Live scores with goals and cards', 'Team stats and league tables']], ['UFC', ['Every card with live fight status', 'Tale of the tape and career rates', 'Full fight history with stat sheets', 'Results, scorecards and round events']]];
    const lg2 = el('section', null, 'wlleagues'); lg2.append(el('span', 'Every league', 'wlkick'), el('h2', 'One toolkit for four sports'));
    const tabs = el('div', null, 'wltabs'), body = el('ul', null, 'wlbul');
    const showL = (i) => { [...tabs.children].forEach((b, j) => b.classList.toggle('on', i === j)); body.replaceChildren(...SPORTS[i][1].map((t) => { const li = el('li', t); return li; })); };
    SPORTS.forEach(([n], i) => tabs.append(btn(n, 'wltab', () => showL(i)))); showL(0); lg2.append(tabs, body);

    // how it works
    const how = el('section', null, 'wlhow'); how.append(el('span', 'How it works', 'wlkick'), el('h2', 'From the scoreboard to your own call'));
    const steps = el('div', null, 'wlsteps');
    [['Find the game or player', 'Start from today\'s games, search any team, player or fighter.'], ['Read the numbers', 'Hit rates, recent form, matchups and live stats, all on one page.'], ['Make your own call', 'We show the data. We never tell you what to bet.']].forEach(([t, d], i) => { const s = el('div', null, 'wlstep'); s.append(el('b', String(i + 1), 'wln'), el('h3', t), el('p', d)); steps.append(s); });
    how.append(steps);

    // pricing: Free and Pro (the Pro price is a placeholder until the owner sets it; Pro is not on sale yet)
    const PRICE = { month: 19, year: 190 };
    const mem = el('section', null, 'wlmem'); mem.append(el('span', 'Pricing', 'wlkick'), el('h2', 'Start free. Upgrade when it is ready.'));
    const seg = el('div', null, 'wlseg'), cards = el('div', null, 'wlprices');
    let yearly = true;
    const draw = () => {
      seg.replaceChildren(); [['Monthly', false], ['Yearly', true]].forEach(([l, y]) => { const b = btn(l, 'wlsegb' + (yearly === y ? ' on' : ''), () => { yearly = y; draw(); }); if (y) b.append(el('em', 'Save $' + (PRICE.month * 12 - PRICE.year))); seg.append(b); });
      cards.replaceChildren();
      const free = el('div', null, 'wlcard'), pro = el('div', null, 'wlcard pro');
      free.append(el('h3', 'Free'), el('div', null, 'wlprice'), el('p', 'Free while we are in beta. No credit card.', 'wlnote'));
      free.querySelector('.wlprice').append(el('b', '$0'));
      const fl = el('ul', null, 'wlbul tick'); ['Live scores and full box scores', 'Hit rates for a few players per league', 'Team, fixture and fighter pages', 'Your name on your own account'].forEach((t) => fl.append(el('li', t)));
      free.append(btn('Create account', 'wlgo', go('up')), el('p', 'Invite code needed during the beta.', 'wlnote'), fl);
      pro.append(el('h3', 'Pro'));
      const pr = el('div', null, 'wlprice'); pr.append(el('b', '$' + (yearly ? Math.round(PRICE.year / 12 * 100) / 100 : PRICE.month)), el('span', '/ month')); pro.append(pr, el('p', yearly ? '$' + PRICE.year + ' billed yearly' : 'Billed monthly', 'wlnote'));
      const pl = el('ul', null, 'wlbul tick'); ['Everything in Free', 'Every player, every league', 'Full defence and matchup data', 'Stat sheets for every past fight', 'Cancel anytime'].forEach((t) => pl.append(el('li', t)));
      const soon = btn('Opens after the beta', 'wlalt', () => {}); soon.disabled = true;
      pro.append(soon, el('p', 'Pro is not on sale yet. Early members will hear first.', 'wlnote'), pl);
      cards.append(pro, free);
    };
    draw(); mem.append(seg, cards);

    const foot = el('footer', null, 'wlfoot');
    foot.append(el('p', 'IQVerdict is for information and entertainment only. It is not betting advice and nothing here is guaranteed. You must be 18 or over. Need help with gambling? Gambling Help Online (Australia): 1800 858 858, 24/7.'));
    W.append(bar, hero, f1, f2, f3, f4, lg2, how, mem, foot); document.body.append(W);
  }
  // The header chip: nothing until we know the site has accounts.
  const betPill = () => {
    if (!ACC.ready || !ACC.setup) return null;
    if (ACC.user) { const b = el('button', null, 'accchip on'); b.type = 'button'; b.append(el('span', ACC.user.name.trim().charAt(0).toUpperCase(), 'accav'), el('b', ACC.user.name)); b.addEventListener('click', accMenu); return b; }
    const b = el('button', 'Sign in', 'accchip'); b.type = 'button'; b.addEventListener('click', () => accOpen('in')); return b;
  };
  accLoad();
  const legIcon = (s) => el('span', s === 'won' ? '✓' : s === 'lost' ? '✕' : s === 'void' ? '–' : '•', 'mbi ' + (s || 'open'));
  const betCard = (b) => {
    const legs = legsOf(b);
    const r = el('div', null, 'mbr ' + (b.status || 'open') + (legs ? ' multi' : ''));
    const top = el('div', null, 'mbt'), l = el('div');
    const title = legs ? legs.length + ' leg ' + ((b.sgm === true || b.sgm === 'true') ? 'same game multi' : 'multi') + ' @ $' + num(b.price).toFixed(2) : b.pick + ' @ $' + num(b.price).toFixed(2);
    l.append(el('b', title), el('span', [legs ? null : b.match, (isBonus(b) ? 'Bonus bet $' : '$') + num(b.stake).toFixed(2), b.settled || b.placed].filter(Boolean).join(' · ')));
    const pays = isBonus(b) ? num(b.stake) * (num(b.price) - 1) : num(b.stake) * num(b.price);
    const res = b.status === 'won' || (b.status === 'lost' && !isBonus(b)) ? money(profitOf(b)) : b.status === 'lost' ? '$0.00' : b.status === 'void' ? 'Void' : 'Pays $' + pays.toFixed(2);
    const rr = el('div', null, 'v'); rr.append(el('b', res), el('span', b.status === 'won' ? 'Won' : b.status === 'lost' ? (isBonus(b) ? 'Lost · bonus bet' : 'Lost') : b.status === 'void' ? 'Void' : 'Open'));
    top.append(l, rr); r.append(top);
    if (legs) {
      const ul = el('div', null, 'mblegs');
      legs.forEach((x) => { const d = el('div', null, 'mbleg ' + (x.status || 'open')); const tx = el('div'); tx.append(el('b', x.pick + (num(x.price) ? ' @ ' + num(x.price).toFixed(2) : '')), el('span', x.final || (x.group ? x.match + ' · ' + x.group : x.match))); d.append(legIcon(x.status), tx); ul.append(d); });
      r.append(el('span', legs.filter((x) => x.status === 'won').length + ' of ' + legs.length + ' legs landed', 'mbcount'), ul);
    }
    return r;
  };
  // Day-by-day profit / loss: one bar per settle day, up (green) for a winning day, down (red) for a losing one,
  // from a zero line. Tap or hover a bar for that day's bets, record, result and the running total.
  const dayTime = (d) => { const m = String(d || '').match(/(\d+) (\w{3})/); if (!m) return 0; const now = new Date(); let t = Date.parse(m[1] + ' ' + m[2] + ' ' + now.getFullYear()); if (t > now.getTime() + 7 * 86400000) t = Date.parse(m[1] + ' ' + m[2] + ' ' + (now.getFullYear() - 1)); return t || 0; };
  function plDays(settled) {
    const by = {}; settled.forEach((b) => { const d = String(b.settled || b.placed || '').split(',')[0]; (by[d] = by[d] || []).push(b); });
    const days = Object.keys(by).filter((d) => dayTime(d)).sort((a, b) => dayTime(a) - dayTime(b)).slice(-14);
    if (days.length < 2) return null;
    let run = 0; const rows = days.map((d) => { const bs = by[d], v = bs.reduce((t, b) => t + profitOf(b), 0); run += v; const w = bs.filter((b) => b.status === 'won').length; return { d, v, run, n: bs.length, w }; });
    const max = Math.max(1, ...rows.map((r) => Math.abs(r.v)));
    const wrap = el('div', null, 'pld'), plot = el('div', null, 'pldplot'), read = el('p', null, 'pldread');
    plot.setAttribute('role', 'img'); plot.setAttribute('aria-label', 'Profit and loss by day: ' + rows.map((r) => r.d + ' ' + money(r.v)).join(', '));
    const show = (r, col) => { read.replaceChildren(el('b', r.d), document.createTextNode(' · ' + r.n + (r.n === 1 ? ' bet' : ' bets') + ' · ' + r.w + '-' + (r.n - r.w) + ' · '), el('b', money(r.v), r.v > 0 ? 'up' : r.v < 0 ? 'dn' : ''), document.createTextNode(' · running ' + money(r.run))); plot.querySelectorAll('.pldc').forEach((c) => c.classList.toggle('on', c === col)); };
    const hiI = rows.reduce((b, r, i) => (r.v > rows[b].v ? i : b), 0), loI = rows.reduce((b, r, i) => (r.v < rows[b].v ? i : b), 0);
    rows.forEach((r, i) => {
      const col = el('button', null, 'pldc'); col.type = 'button'; col.setAttribute('aria-label', r.d + ': ' + money(r.v));
      const up = el('div', null, 'pldu'), dn = el('div', null, 'pldd'), bar = el('i', null, r.v >= 0 ? 'up' : 'dn');
      bar.style.height = Math.max(r.v ? 3 : 0, (100 * Math.abs(r.v)) / max) + '%';
      (r.v >= 0 ? up : dn).append(bar);
      if ((i === hiI && r.v > 0) || (i === loI && r.v < 0)) bar.append(el('small', money(r.v).replace('.00', ''), 'pldl'));
      col.append(up, dn, el('span', r.d.split(' ')[0].slice(0, 2) + ' ' + r.d.split(' ')[1], 'pldx'));
      col.addEventListener('mouseenter', () => show(r, col)); col.addEventListener('focus', () => show(r, col)); col.addEventListener('click', () => show(r, col));
      plot.append(col);
    });
    wrap.append(plot, read); show(rows[rows.length - 1], plot.lastChild);
    return wrap;
  }
  // Public site: Jacob's picks from pubbets (export-public.js): the win-loss record and the open bets, no money.
  function pubBets(pb) {
    const rec = pb.find((x) => x.kind === 'record') || { won: 0, lost: 0 }, open = pb.filter((x) => x.kind === 'bet');
    const st = el('div', null, 'ppst'); const cell = (lab, v) => { const d = el('div'); d.append(el('span', lab), el('b', v)); return d; };
    st.append(cell('Record', rec.won + '-' + rec.lost), cell('Open bets', String(open.length || 'None')));
    const out = [st];
    if (open.length) {
      out.push(el('div', 'Open', 'mbsec')); const t = el('div', null, 'mbl');
      open.slice().reverse().forEach((b) => {
        const legs = Array.isArray(b.legs) ? b.legs : null, r = el('div', null, 'mbr open' + (legs ? ' multi' : '')), top = el('div', null, 'mbt'), l = el('div');
        l.append(el('b', legs ? legs.length + ' leg ' + (b.sgm ? 'same game multi' : 'multi') : b.pick), el('span', [legs ? null : b.match, b.placed].filter(Boolean).join(' · ')));
        top.append(l); r.append(top);
        if (legs) { const ul = el('div', null, 'mblegs'); legs.forEach((x) => { const d = el('div', null, 'mbleg ' + (x.status || 'open')); const tx = el('div'); tx.append(el('b', x.pick), el('span', x.final || x.match)); d.append(legIcon(x.status), tx); ul.append(d); });
          r.append(el('span', legs.filter((x) => x.status === 'won').length + ' of ' + legs.length + ' legs landed', 'mbcount'), ul); }
        t.append(r);
      });
      out.push(t);
    }
    return out;
  }
  // Home: all my bets in one place: record, open bets, then the latest results (full list in Review).
  dash.draw('mybets', (box) => {
    { const st = dash.data('bets').status, sec = box.closest('section'), pb = rows('pubbets');
      if (st !== 'ok' && st !== 'loading' && pb.length) { if (sec) sec.classList.remove('isempty'); box.replaceChildren(...pubBets(pb)); return; }
      if (sec) sec.classList.toggle('isempty', st !== 'ok' && st !== 'loading'); if (st !== 'ok') { if (st === 'loading') box.replaceChildren(skel(2)); return; } }
    const all = betRows(), open = all.filter(isOpen).reverse(), done = all.filter((b) => !isOpen(b)).reverse();
    if (!all.length) { box.replaceChildren(el('p', 'No bets yet. Send Claude a screenshot of a bet and it shows here.', 'plnone')); return; }
    const settled = done.filter((b) => b.status === 'won' || b.status === 'lost'), won = settled.filter((b) => b.status === 'won').length, profit = settled.reduce((s, b) => s + profitOf(b), 0);
    const pot = open.reduce((s, b) => s + (isBonus(b) ? num(b.stake) * (num(b.price) - 1) : num(b.stake) * num(b.price)), 0);
    const st = el('div', null, 'ppst');
    const cell = (lab, v, c) => { const d = el('div', null, c || ''); d.append(el('span', lab), el('b', v)); return d; };
    st.append(cell('Record', won + '-' + (settled.length - won)), cell('Profit', money(profit), profit > 0 ? 'up' : profit < 0 ? 'dn' : ''), cell(open.length ? open.length + ' open · could pay' : 'Open bets', open.length ? '$' + pot.toFixed(2) : 'None'));
    const out = [st];
    { const ch = plDays(settled); if (ch) out.push(el('div', 'Day by day', 'mbsec'), ch); }
    if (open.length) { out.push(el('div', 'Open', 'mbsec')); const t = el('div', null, 'mbl'); open.forEach((b) => t.append(betCard(b))); out.push(t); }
    if (done.length) {
      // Latest results in a drop-down bar (closed by default)
      const d = el('details', null, 'bbdrop mbres'), sm = el('summary'); sm.append(el('b', 'Latest results'), el('span', String(Math.min(3, done.length)) + ' of ' + done.length, 'muted'));
      const t = el('div', null, 'mbl'); done.slice(0, 3).forEach((b) => t.append(betCard(b)));
      const more = el('button', 'All ' + done.length + ' results and the profit chart ›', 'bbmore'); more.type = 'button'; more.addEventListener('click', () => X.openBetResults());
      d.append(sm, t, more); out.push(d);
    }
    box.replaceChildren(...out);
  });
  // Collapsed My bets header on Home: a one-line summary; tap to slide the bets down.
  dash.draw('mybetsum', (box) => {
    if (dash.data('bets').status !== 'ok' && rows('pubbets').length) { const pb = rows('pubbets'), rec = pb.find((x) => x.kind === 'record') || { won: 0, lost: 0 }, n = pb.filter((x) => x.kind === 'bet').length; box.textContent = (n ? n + ' open · ' : '') + rec.won + '-' + rec.lost; return; }
    const all = betRows(), open = all.filter(isOpen), settled = all.filter((b) => b.status === 'won' || b.status === 'lost');
    const won = settled.filter((b) => b.status === 'won').length, pr = settled.reduce((s, b) => s + profitOf(b), 0);
    box.textContent = [open.length ? open.length + ' open' : '', settled.length ? won + '-' + (settled.length - won) + ' · ' + money(pr) : ''].filter(Boolean).join(' · ') || 'No bets yet';
  });
  // Review: folded header line for settled bets
  dash.draw('mybetsrvsum', (box) => {
    const done = betRows().filter((b) => b.status === 'won' || b.status === 'lost');
    if (!done.length) { box.textContent = 'None settled yet'; return; }
    const won = done.filter((b) => b.status === 'won').length, pr = done.reduce((s, b) => s + profitOf(b), 0);
    box.textContent = won + '-' + (done.length - won) + ' · ' + money(pr); box.className = 'mbsum ' + (pr > 0 ? 'up' : pr < 0 ? 'dn' : '');
  });
  // Review: settled bets, newest first, each with a bar out from the middle (green right = profit, red left = loss).
  dash.draw('mybetsrv', (box) => {
    { const st = dash.data('bets').status, sec = box.closest('section'); if (sec) sec.classList.toggle('isempty', st !== 'ok' && st !== 'loading'); if (st !== 'ok') return; }
    const done = betRows().filter((b) => !isOpen(b)).reverse();
    if (!done.length) { box.replaceChildren(el('p', 'No settled bets yet. Bets move here from Home once every leg is decided.', 'plnone')); return; }
    const settled = done.filter((b) => b.status === 'won' || b.status === 'lost');
    const profit = settled.reduce((s, b) => s + profitOf(b), 0), won = settled.filter((b) => b.status === 'won').length;
    const cashIn = settled.filter((b) => !isBonus(b)).reduce((s, b) => s + num(b.stake), 0);
    const st = el('div', null, 'ppst');
    const cell = (lab, v, c) => { const d = el('div', null, c || ''); d.append(el('span', lab), el('b', v)); return d; };
    st.append(cell('Record', won + '-' + (settled.length - won)), cell('Profit', money(profit), profit > 0 ? 'up' : profit < 0 ? 'dn' : ''), cell('Return', cashIn ? Math.round((100 * profit) / cashIn) + '%' : '–'));
    // Running total bar
    const max = Math.max(1, ...done.map((b) => Math.abs(profitOf(b))), Math.abs(profit));
    const bar = (v, label, sub, big) => {
      const row = el('div', null, 'plrow' + (big ? ' tot' : ''));
      const lab = el('div', null, 'pll'); lab.append(el('b', label), el('span', sub || ''));
      const track = el('div', null, 'pltrack'); const fill = el('div', null, 'plfill ' + (v > 0 ? 'up' : v < 0 ? 'dn' : 'zero'));
      const w = Math.max(v ? 2 : 0, (50 * Math.abs(v)) / max); fill.style.width = w + '%'; fill.style[v >= 0 ? 'left' : 'right'] = '50%';
      track.append(el('i', null, 'plmid'), fill);
      row.append(lab, track, el('b', money(v), 'plv ' + (v > 0 ? 'up' : v < 0 ? 'dn' : ''))); return row;
    };
    const bars = el('div', null, 'plbars');
    bars.append(bar(profit, 'All settled bets', settled.length + (settled.length === 1 ? ' bet' : ' bets'), true));
    done.forEach((b) => bars.append(bar(profitOf(b), legsOf(b) ? legsOf(b).length + ' leg ' + ((b.sgm === true || b.sgm === 'true') ? 'SGM' : 'multi') + ' @ $' + num(b.price).toFixed(2) : b.pick, [b.settled || b.placed, isBonus(b) ? 'bonus bet' : null].filter(Boolean).join(' · '))));
    const det = document.createElement('details'); det.className = 'moredet mbdet'; det.append(el('summary', 'Bet details (' + done.length + ')'));
    const t = el('div', null, 'mbl'); done.forEach((b) => t.append(betCard(b))); det.append(t);
    box.replaceChildren(st, bars, det);
  });


  // ---- Live: scores, box scores and how our picks are tracking, from BigQuery (datasets livegames, livebox),
  // written every minute during games by the iqverdict-live Cloud Function. The page reads them when it
  // opens and whenever a game is opened or Refresh is tapped.
  ['livegames', 'livebox'].forEach((id) => dash.loader(id, { description: 'BigQuery’s answer as rows', fn: ({ answer, read }) => read.bigquery(answer) }));
  const liveRows = (id) => { const g = dash.data(id); return g.status === 'ok' && Array.isArray(g.data) ? g.data : []; };
  const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\b(fc|cf|ac|as|sc|fk|sk|afc|club|de|cp|rc|vfb|vfl|rb|ssc)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const nsim = (a, b) => { a = nrm(a); b = nrm(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); };
  const refreshLive = () => { try { dash.refresh('livegames'); dash.refresh('livebox'); } catch (e) { /* not connected */ } };
  // The live row for one of our games: NBA / NFL by id, football by team names, and only on the day being
  // viewed (default: the day on screen), since the same teams can meet on back-to-back days.
  function liveOf(sp, ref, day) {
    const dd = day || X.selDay;
    const rs = liveRows('livegames').filter((r) => r.sport === sp && (!dd || !r.start_time || dayKey(new Date(r.start_time)) === dd));
    if (sp === 'fb') return rs.find((r) => nsim(r.home_name, ref.home) && nsim(r.away_name, ref.away)) || null;
    return rs.filter((r) => r.game_id === ref).sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)))[0] || null;
  }
  const stateTxt = (r) => (r.state === 'in' ? 'LIVE · ' + r.status_text : r.state === 'post' ? (r.status_text || 'Final').toUpperCase() : '');
  const sc = (v) => (v == null ? 0 : Number(v));

  // Game card: live score in place of the start time, with LIVE / FINAL.
  function liveDecor(b, sp, ref) {
    b.addEventListener('click', refreshLive);
    const r = liveOf(sp, ref); if (!r || r.state === 'pre') return;
    const st = b.querySelector('.mid strong'), pre = b.querySelector('.mid .pre');
    if (st) st.textContent = sc(r.away_score) + ' – ' + sc(r.home_score);
    const dup = b.querySelector('.mid .fsc'); if (dup) dup.remove(); // one score only: the live one (the saved result line can lag behind it)
    if (pre) { pre.textContent = stateTxt(r); pre.classList.add(r.state === 'in' ? 'lvon' : 'lvdone'); }
  }


  // UFC: live round and clock on a fight card (or the fight page header), and the winner as soon as ESPN names one.
  function ufcLive(r) {
    return liveRows('livegames').find((x) => x.sport === 'ufc' && ((nsim(x.away_name, r.a) && nsim(x.home_name, r.b)) || (nsim(x.away_name, r.b) && nsim(x.home_name, r.a)))) || null;
  }
  function liveUfc(b, r, head) {
    if (!head) b.addEventListener('click', refreshLive);
    const lr = ufcLive(r); if (!lr || lr.state === 'pre') return;
    const pre = head ? null : b.querySelector('.mid .pre'), pk = head ? null : b.querySelector('.mid .pk');
    let ex = {}; try { ex = JSON.parse(lr.extra || '{}') || {}; } catch (e) { /* none */ }
    const done = lr.state === 'post', w = ex.winner;
    const txt = !done ? 'LIVE · ' + lr.status_text : 'FINAL' + (w ? ' · ' + w.split(' ').slice(-1)[0] + ' won' : '');
    if (pre) { pre.textContent = txt; pre.classList.add(done ? 'lvdone' : 'lvon'); }
    else { const t = el('span', txt, 'pre ' + (done ? 'lvdone' : 'lvon')); (head ? b : b.querySelector('.mid')).append(t); }
    if (done && w && r.pick && pk) { const hit = nsim(w, r.pick); pk.textContent = (hit ? '✓ ' : '✕ ') + 'Pick ' + r.pick; pk.classList.add(hit ? 'lvhit' : 'lvmiss'); }
    if (done && w && !head) { const tms = b.querySelectorAll('.tm'); if (tms.length === 2) { tms[0].classList.toggle('win', nsim(w, r.a)); tms[1].classList.toggle('win', nsim(w, r.b)); } }
    b.classList.add(done ? 'lvdone' : 'lvon');
  }
  // UFC fight page: live fight stats (from the livebox rows), shown while a fight is on and after it ends.
  function ufcLiveCard(r) {
    const lr = ufcLive(r); if (!lr || lr.state === 'pre') return null;
    const pl = liveRows('livebox').filter((b) => b.sport === 'ufc' && String(b.espn_id) === String(lr.espn_id)).map((b) => { let st = {}; try { st = JSON.parse(b.stats || '{}'); } catch (e) { st = {}; } return { name: b.player, st }; });
    const A = pl.find((p) => nsim(p.name, r.a)), B = pl.find((p) => nsim(p.name, r.b));
    const done = lr.state === 'post', card = el('div', null, 'fglive');
    card.append(el('div', done ? 'Fight stats · final' : 'LIVE · ' + lr.status_text, 'fglh ' + (done ? 'done' : 'on')));
    if (!A || !B) { card.append(el('p', 'Live stats appear once the first round is under way.', 'muted')); return card; }
    const n = (p, k) => Number(p.st[k] || 0), clk = (v) => { v = Math.round(Number(v) || 0); return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0'); };
    const rowsDef = [
      ['Significant strikes', (p) => n(p, 'sigStrikesLanded') + '/' + n(p, 'sigStrikesAttempted'), (p) => n(p, 'sigStrikesLanded')],
      ['Total strikes', (p) => n(p, 'totalStrikesLanded') + '/' + n(p, 'totalStrikesAttempted'), (p) => n(p, 'totalStrikesLanded')],
      ['Knockdowns', (p) => String(n(p, 'knockDowns')), (p) => n(p, 'knockDowns')],
      ['Takedowns', (p) => n(p, 'takedownsLanded') + '/' + n(p, 'takedownsAttempted'), (p) => n(p, 'takedownsLanded')],
      ['Submission attempts', (p) => String(n(p, 'submissions')), (p) => n(p, 'submissions')],
      ['Control time', (p) => clk(p.st.timeInControl), (p) => n(p, 'timeInControl')],
      ['Head strikes', (p) => String(n(p, 'sigDistanceHeadStrikesLanded') + n(p, 'sigClinchHeadStrikesLanded') + n(p, 'sigGroundHeadStrikesLanded')), (p) => n(p, 'sigDistanceHeadStrikesLanded') + n(p, 'sigClinchHeadStrikesLanded') + n(p, 'sigGroundHeadStrikesLanded')],
    ];
    const head = el('div', null, 'fglr fglnames'); head.append(el('b', r.a.replace(/ \(c\)$/, '')), el('span', ''), el('b', r.b.replace(/ \(c\)$/, ''))); card.append(head);
    rowsDef.forEach(([lab, f, v]) => {
      const row = el('div', null, 'fglr'), va = v(A), vb = v(B);
      const a = el('b', f(A), va > vb ? 'win' : ''), b = el('b', f(B), vb > va ? 'win' : '');
      row.append(a, el('span', lab), b); card.append(row);
    });
    return card;
  }
  // Home page UFC tile: red dot + LIVE · Round, or FINAL with the winner.
  function liveUfcHome(c, f) {
    const lr = ufcLive(f); if (!lr || lr.state === 'pre') return c;
    let ex = {}; try { ex = JSON.parse(lr.extra || '{}') || {}; } catch (e) { /* none */ }
    const done = lr.state === 'post', tm = c.querySelector('.tm'), pk = c.querySelector('.pk');
    if (tm) tm.textContent = done ? 'FINAL' : 'LIVE · ' + lr.status_text;
    if (done && ex.winner && pk) pk.textContent = (f.pick ? (nsim(ex.winner, f.pick) ? '✓ ' : '✗ ') : '') + 'Won: ' + ex.winner;
    c.classList.add(done ? 'lvdone' : 'lvon'); return c;
  }
  // Home page cards: the live score and status for a game that is on (or just finished but not graded yet).
  function liveHome(b, sp, ref, day) {
    const r = liveOf(sp, ref, day); if (!r || r.state === 'pre') return;
    const tm = b.querySelector('.tm'); if (!tm) return;
    const score = sc(r.away_score) + '-' + sc(r.home_score);
    const txt = (r.state === 'in' ? 'LIVE · ' + r.status_text : 'FT') + ' · ' + (sp === 'fb' ? sc(r.home_score) + '-' + sc(r.away_score) : score);
    const tn = [...tm.childNodes].reverse().find((n) => n.nodeType === 3); // keep the league badge
    if (tn) tn.textContent = txt; else tm.textContent = txt;
    b.classList.add(r.state === 'in' ? 'lvon' : 'lvdone');
  }

  // How our main play stands right now.
  function playStatus(sp, m, r) {
    if (!m || !r) return null;
    const hs = sc(r.home_score), as = sc(r.away_score), tot = hs + as, ov = String(m.pick).match(/^(Over|Under) ([\d.]+)/);
    let ok = null, txt = '';
    if (ov) { const L = Number(ov[2]); ok = ov[1] === 'Over' ? tot > L : tot < L; txt = tot + ' ' + (sp === 'fb' ? (tot === 1 ? 'goal' : 'goals') : 'points') + ' so far' + (ov[1] === 'Over' && !ok ? ', needs ' + (Math.floor(L) + 1 - tot) + ' more' : ''); }
    else if (/^(Both score|Not both)$/.test(m.pick)) { const both = hs > 0 && as > 0; ok = m.pick === 'Both score' ? both : !both; txt = both ? 'both teams have scored' : hs || as ? 'one team has scored' : 'no goals yet'; }
    else if (/ win$/.test(m.pick)) { const home = nsim(m.pick.replace(/ win$/, ''), r.home_name); const d = home ? hs - as : as - hs; ok = d > 0; txt = d > 0 ? 'leading by ' + d : d < 0 ? 'trailing by ' + -d : 'level'; }
    else { const sm = String(m.pick).match(/^(.*) ([+-][\d.]+)$/); if (sm) { const home = nsim(sm[1], r.home_name); const d = (home ? hs - as : as - hs) + Number(sm[2]); ok = d > 0; txt = (d > 0 ? 'covering by ' : 'short by ') + Math.abs(d); } }
    if (ok == null) return null;
    const done = r.state === 'post';
    const p = el('p', null, 'lvplay ' + (ok ? 'ok' : 'no'));
    p.append(el('b', (done ? (ok ? '✓ ' : '✕ ') : '') + 'Main play ' + m.pick), document.createTextNode(': ' + (done ? (ok ? 'won' : 'lost') + ' · ' : '') + txt + '.'));
    return p;
  }

  // Live card at the top of a game page.
  const LVTAB = {}; // live box score: which team's tab is open, per game
  function liveCard(sp, ref) {
    const r = liveOf(sp, ref); if (!r || r.state === 'pre') return null;
    const card = el('div', null, 'card lvcard'); const h = el('h2', 'Live'); card.append(h);
    const top = el('div', null, 'lvtop');
    const fbn = sp === 'fb';
    const side = (name, s) => { const d = el('div', null, 'lvs'); d.append(el('span', name), el('b', String(sc(s)))); return d; };
    // same sides as the game page header: football home on the left, NBA / NFL away on the left
    const L = fbn ? [r.home_name, r.home_score] : [r.away_name, r.away_score], R = fbn ? [r.away_name, r.away_score] : [r.home_name, r.home_score];
    top.append(side(...L), el('span', stateTxt(r), 'lvst ' + (r.state === 'in' ? 'on' : 'done')), side(...R));
    card.append(top);
    const rb = el('button', 'Refresh', 'lvref'); rb.type = 'button'; rb.addEventListener('click', (e) => { e.stopPropagation(); refreshLive(); }); card.append(rb);
    // quarter / half scores
    let ls = []; try { ls = JSON.parse(r.linescore || '[]'); } catch (e) { ls = []; }
    if (ls.length && !fbn) {
      const t = el('table', null, 'lvls'); const hr = el('tr'); hr.append(el('th', '')); ls.forEach((q, i) => hr.append(el('th', i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3)))); hr.append(el('th', 'T')); t.append(hr);
      [[r.away_code, 1, r.away_score], [r.home_code, 0, r.home_score]].forEach(([c, k, tot]) => { const tr = el('tr'); tr.append(el('td', c)); ls.forEach((q) => tr.append(el('td', q[k] == null ? '–' : String(q[k])))); tr.append(el('td', String(sc(tot)), 'tot')); t.append(tr); });
      card.append(t);
    }
    if (fbn) { // goals, cards and team stats
      let x = {}; try { x = JSON.parse(r.extra || '{}'); } catch (e) { x = {}; }
      if ((x.events || []).length) { const ul = el('div', null, 'lvev'); x.events.forEach((e) => { const d = el('div'); d.append(el('span', e.t, 't'), el('span', /goal|penalty - scored/i.test(e.type) ? '⚽' : /red/i.test(e.type) ? '🟥' : '🟨', 'i'), el('span', e.text)); ul.append(d); }); card.append(ul); }
      const H = (x.teams || []).find((t) => t.ha === 'home'), A = (x.teams || []).find((t) => t.ha === 'away');
      if (H && A) { const t = el('table', null, 'lvls lvst2'); [['Possession %', 'possessionPct'], ['Shots', 'totalShots'], ['On target', 'shotsOnTarget'], ['Corners', 'wonCorners'], ['Yellow cards', 'yellowCards'], ['Red cards', 'redCards']].forEach(([l, k]) => { const tr = el('tr'); tr.append(el('td', H.st[k] ?? '–', 'n'), el('td', l), el('td', A.st[k] ?? '–', 'n')); t.append(tr); }); card.append(t); }
    } else { // player box score
      const box = liveRows('livebox').filter((b) => b.espn_id === r.espn_id);
      // one team at a time: a tab for each side (the choice is kept while the score refreshes)
      const sides = [[r.away_code, r.away_name], [r.home_code, r.home_name]].filter(([c]) => box.some((b) => b.team === c));
      const pick = LVTAB[r.espn_id] && sides.some(([c]) => c === LVTAB[r.espn_id]) ? LVTAB[r.espn_id] : (sides[0] || [])[0];
      const panes = {};
      if (sides.length > 1) {
        const bar = el('div', null, 'lvtabs'); bar.setAttribute('role', 'tablist');
        sides.forEach(([c, nm]) => { const b = el('button', String(nm || c).split(' ').slice(-1)[0] || c, 'lvtab' + (c === pick ? ' on' : '')); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(c === pick));
          b.addEventListener('click', (e) => { e.stopPropagation(); LVTAB[r.espn_id] = c; bar.querySelectorAll('.lvtab').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); }); Object.entries(panes).forEach(([k, d]) => { d.hidden = k !== c; }); });
          bar.append(b); });
        card.append(bar);
      }
      sides.map(([c]) => c).forEach((team) => {
        const pl = box.filter((b) => b.team === team).map((b) => { let s = {}; try { s = JSON.parse(b.stats || '{}'); } catch (e) { s = {}; } return { ...b, s }; });
        if (!pl.length) return;
        const pane = el('div', null, 'lvpane'); pane.hidden = team !== pick; panes[team] = pane; card.append(pane);
        if (sides.length < 2) pane.append(el('h3', team, 'lvteam'));
        let t = el('table', null, 'lvbox');
        if (sp === 'nba') {
          // starting five first, then the bench, each in ESPN's order (not sorted by points)
          const isSt = (p) => String(p.starter) === 'true';
          const ordered = pl.filter((p) => !p.s.dnp).map((p, i) => [p, i]).sort((a, b) => (isSt(b[0]) ? 1 : 0) - (isSt(a[0]) ? 1 : 0) || a[1] - b[1]).map((x) => x[0]);
          t = boxTable(ordered.map(bxLive));
        } else { // NFL: passing, rushing, receiving and defence (sacks, QB hits, tackles for loss, passes defended, tackles)
          t = el('div', null, 'nflbox');
          const n0 = (v) => (v == null || v === '' ? '–' : String(v));
          const nm = (p) => String(p.player || '').replace(/^(\S)\S*\s+(?=\S)/, '$1. ');
          const top = (k, n) => pl.filter((p) => p.s[k] != null && p.s[k] !== '' && Number(p.s[k]) >= 0).sort((a, b) => Number(b.s[k]) - Number(a.s[k])).slice(0, n);
          const sect = (title, heads, plist, cells, total) => {
            if (!plist.length) return;
            const tb = el('table', null, 'lvbox fullbox nflt'), hr = el('tr'); hr.append(el('th', title)); heads.forEach((h) => hr.append(el('th', h, 'n'))); tb.append(hr);
            plist.forEach((p) => { const tr = el('tr'), td = el('td'), b = el('b', nm(p)); b.title = p.player; td.append(b); tr.append(td); cells(p.s).forEach((c) => tr.append(el('td', n0(c), 'n'))); tb.append(tr); });
            if (total) { const tr = el('tr', null, 'lvtot'); tr.append(el('td', 'Team')); total.forEach((c) => tr.append(el('td', n0(c), 'n'))); tb.append(tr); }
            const sc2 = el('div', null, 'scroll'); sc2.append(tb); t.append(sc2);
          };
          const sk = (v) => String(v || '').split('-')[0];
          sect('Passing', ['C/ATT', 'YDS', 'TD', 'INT', 'SACKED'], top('passing.passingYards', 2), (s) => [s['passing.completions/passingAttempts'], s['passing.passingYards'], s['passing.passingTouchdowns'] || 0, s['passing.interceptions'] || 0, sk(s['passing.sacks-sackYardsLost']) || 0]);
          sect('Rushing', ['CAR', 'YDS', 'AVG', 'TD', 'LNG'], top('rushing.rushingYards', 4), (s) => [s['rushing.rushingAttempts'], s['rushing.rushingYards'], s['rushing.yardsPerRushAttempt'], s['rushing.rushingTouchdowns'] || 0, s['rushing.longRushing']]);
          sect('Receiving', ['REC', 'TGT', 'YDS', 'TD', 'LNG'], top('receiving.receivingYards', 6), (s) => [s['receiving.receptions'], s['receiving.receivingTargets'], s['receiving.receivingYards'], s['receiving.receivingTouchdowns'] || 0, s['receiving.longReception']]);
          const dnum = (s, k) => Number(s['defensive.' + k] || 0) + (k === 'interceptions' ? Number(s['interceptions.interceptions'] || 0) : 0);
          const score = (p) => dnum(p.s, 'sacks') * 6 + dnum(p.s, 'interceptions') * 6 + dnum(p.s, 'QBHits') * 3 + dnum(p.s, 'tacklesForLoss') * 3 + dnum(p.s, 'passesDefended') * 3 + dnum(p.s, 'totalTackles');
          const def = pl.filter((p) => p.s['defensive.totalTackles'] != null).sort((a, b) => score(b) - score(a)).slice(0, 8);
          const tot = (k) => pl.reduce((a, p) => a + dnum(p.s, k), 0);
          sect('Defence', ['TKL', 'SOLO', 'SACK', 'TFL', 'QB HIT', 'PD', 'INT'], def, (s) => [dnum(s, 'totalTackles'), dnum(s, 'soloTackles'), dnum(s, 'sacks'), dnum(s, 'tacklesForLoss'), dnum(s, 'QBHits'), dnum(s, 'passesDefended'), dnum(s, 'interceptions')],
            ['totalTackles', 'soloTackles', 'sacks', 'tacklesForLoss', 'QBHits', 'passesDefended', 'interceptions'].map(tot));
          if (def.length) t.append(el('p', 'Sacks, QB hits and tackles for loss show the pressure on the quarterback. ESPN does not publish pressures or hurries.', 'muted lvnote'));
          if (!t.children.length) t.append(el('p', 'Stats appear once the game is under way.', 'muted'));
        }
        if (t.classList.contains('nflbox')) pane.append(t); else { const w = el('div', null, 'scroll'); w.append(t); pane.append(w); }
      });
    }
    card.append(el('p', 'Updated ' + new Date(r.updated_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Australia/Sydney' }), 'lvupd'));
    return card;
  }

  // ---- Swipe back: a swipe to the right returns to the page you were on before (page history in the page
  // script); with no history it does what the page's Back button does. Rows that scroll sideways (tabs, strips, tables) keep their own swipes.
  (() => {
    let x0 = 0, y0 = 0, t0 = 0, ok = false;
    const scrollsX = (n) => { for (; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 2) return true; } return false; };
    const backBtn = () => [...document.querySelectorAll('.backbtn')].find((b) => b.offsetParent !== null && b.getClientRects().length);
    const hint = el('div', '‹', 'swback'); document.body.append(hint);
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) { ok = false; return; }
      const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
      ok = (X.navDepth && X.navDepth() > 0 || !!backBtn()) && (x0 < 40 || !scrollsX(e.target));
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!ok) return; const t = e.touches[0], dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
      if (dy > 40 && dy > dx) { ok = false; hint.style.opacity = 0; return; }
      if (dx > 20) { hint.style.opacity = Math.min(1, dx / 110); hint.style.transform = 'translate(' + Math.min(dx / 3, 36) + 'px,-50%)'; }
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      const was = ok; ok = false; hint.style.opacity = 0; hint.style.transform = '';
      if (!was) return; const t = e.changedTouches[0], dx = t.clientX - x0, dy = Math.abs(t.clientY - y0);
      if (dx > 90 && dy < 60 && dx > 2 * dy && Date.now() - t0 < 900) { const b = backBtn(); if (b) b.click(); else if (X.navBack) X.navBack(); } // same as tapping Back
    }, { passive: true });
  })();

  // ---- NBA defence by court zone (pbp team rows): what each defence allows in the restricted area, the rest of
  // the paint, mid-range, both corner threes and above-the-break threes, on a half court coloured by league rank.
  const ZONES = [['ra', 'Restricted area'], ['paint', 'Paint'], ['mid', 'Mid-range'], ['lc', 'Left corner 3'], ['rc', 'Right corner 3'], ['atb', 'Above-break 3']];
  const zoneTable = () => {
    const T = rows('pbp').filter((r) => r.k === 't'); if (!T.length) return null;
    const pct = (z) => (z && z[0] ? z[1] / z[0] : null);
    const lg = {}, rk = {};
    ZONES.forEach(([k]) => {
      const a = T.reduce((s, t) => s + ((t.z && t.z[k] && t.z[k][0]) || 0), 0), m = T.reduce((s, t) => s + ((t.z && t.z[k] && t.z[k][1]) || 0), 0);
      lg[k] = a ? m / a : null;
      const order = T.filter((t) => pct(t.z && t.z[k]) != null).sort((x, y) => pct(x.z[k]) - pct(y.z[k])); // 1 = lowest FG% allowed (best)
      rk[k] = Object.fromEntries(order.map((t, i) => [t.team, i + 1]));
    });
    return { T, lg, rk, n: T.length, pct };
  };
  const tier = (r, n) => (r <= Math.round(n / 3) ? 'g' : r > Math.round((2 * n) / 3) ? 'r' : 'a');
  const COL = { g: '#1fd56b', a: '#a9aeb7', r: '#ff5a5f' };
  function courtSvg(team, Z, label) {
    const t = Z.T.find((x) => x.team === team); if (!t) return null;
    const c = (k) => COL[tier(Z.rk[k][team] || Z.n, Z.n)];
    const lab = (k, x, y, size) => { const r = Z.rk[k][team], p = Z.pct(t.z[k]); return '<text x="' + x + '" y="' + y + '" font-size="' + (size || 22) + '" text-anchor="middle" fill="#fff" font-weight="700">' + (p == null ? '–' : Math.round(p * 100) + '%') + '</text><text x="' + x + '" y="' + (y + (size || 22) * 0.95) + '" font-size="' + Math.round((size || 22) * 0.7) + '" text-anchor="middle" fill="#fff" opacity=".9">#' + r + '</text>'; };
    // half court, baseline at the top: 500 x 470 = 50 x 47 ft; basket 5.25 ft out; 3pt arc 23.75 ft; corners 22 ft, 14 ft deep
    return '<svg viewBox="0 0 500 470" class="dcourt" role="img" aria-label="' + (label || 'Opponent shooting by zone') + '">' +
      '<rect x="0" y="0" width="500" height="470" fill="' + c('atb') + '"/>' +
      '<rect x="0" y="0" width="30" height="142" fill="' + c('lc') + '"/><rect x="470" y="0" width="30" height="142" fill="' + c('rc') + '"/>' +
      '<path d="M30 0 V142 A237.5 237.5 0 0 0 470 142 V0 Z" fill="' + c('mid') + '"/>' +
      '<rect x="170" y="0" width="160" height="190" fill="' + c('paint') + '"/>' +
      '<path d="M210 0 V52.5 A40 40 0 0 0 290 52.5 V0 Z" fill="' + c('ra') + '"/>' +
      '<g fill="none" stroke="rgba(255,255,255,.85)" stroke-width="3"><rect x="1.5" y="1.5" width="497" height="467"/><path d="M30 0 V142 A237.5 237.5 0 0 0 470 142 V0"/><rect x="170" y="0" width="160" height="190"/><path d="M210 0 V52.5 A40 40 0 0 0 290 52.5 V0"/><circle cx="250" cy="190" r="60"/><line x1="220" y1="40" x2="280" y2="40"/><circle cx="250" cy="52.5" r="7.5"/></g>' +
      lab('ra', 250, 80, 18) + lab('paint', 250, 150) + lab('mid', 250, 262, 18) + lab('lc', 16, 70, 12) + lab('rc', 484, 70, 12) + lab('atb', 250, 410) +
      '</svg>';
  }
  // This game against the season: what the defence allowed in one finished game (gzones, fetch-game-zones.js) next to
  // its average over its other games this season. Lower FG% allowed is better, so green = tighter than usual.
  function zoneGame(team, id, day) {
    const all = rows('gzones').filter((r) => r.team === team); if (!all.length) return null;
    const g = all.find((r) => r.game === id && (!day || r.day === day)); if (!g) return null;
    const rest = all.filter((r) => r.ev !== g.ev); if (!rest.length) return null;
    const pc = (z) => (z && z[0] ? z[1] / z[0] : null);
    const sum = (k) => rest.reduce((a, r) => [a[0] + ((r.z[k] || [])[0] || 0), a[1] + ((r.z[k] || [])[1] || 0)], [0, 0]);
    const tot = (zs) => ZONES.reduce((a, [k]) => [a[0] + ((zs[k] || [])[0] || 0), a[1] + ((zs[k] || [])[1] || 0)], [0, 0]);
    const box = el('div', null, 'dgame'); box.append(el('h3', 'This game vs their average', 'dgh'));
    const gT = tot(g.z), sT = ZONES.reduce((a, [k]) => { const x = sum(k); return [a[0] + x[0], a[1] + x[1]]; }, [0, 0]);
    const gp = pc(gT), sp = pc(sT), d = gp != null && sp != null ? Math.round((gp - sp) * 100) : null;
    box.append(el('p', 'Allowed ' + g.opp + ' ' + gT[1] + ' of ' + gT[0] + ' (' + Math.round(gp * 100) + '%) against ' + Math.round(sp * 100) + '% on average over ' + rest.length + ' other games' + (d == null ? '.' : d === 0 ? ': about the same.' : d < 0 ? ': ' + -d + ' points tighter than usual.' : ': ' + d + ' points looser than usual.'), 'muted'));
    const tb = el('table', null, 'dtbl'); const hr = el('tr'); ['Zone', 'This game', 'Average', 'Diff'].forEach((h, j) => hr.append(el('th', h, j ? 'n' : ''))); tb.append(hr);
    ZONES.forEach(([k, l]) => {
      const z = g.z[k] || [0, 0], p = pc(z), a = sum(k), ap = pc(a), avgA = a[0] / rest.length;
      const tr = el('tr'); const dc = el('td', null, 'n');
      if (p != null && ap != null) { const dd = Math.round((p - ap) * 100); dc.append(el('span', (dd > 0 ? '+' : '') + dd, 'drk ' + (dd <= -5 ? 'g' : dd >= 5 ? 'r' : 'a'))); } else dc.textContent = '–';
      tr.append(el('td', l), el('td', z[0] ? z[1] + '/' + z[0] + ' · ' + Math.round(p * 100) + '%' : '0 shots', 'n'), el('td', ap == null ? '–' : Math.round(ap * 100) + '% · ' + avgA.toFixed(1) + ' shots', 'n'), dc);
      tb.append(tr);
    });
    const w = el('div', null, 'scroll'); w.append(tb); box.append(w);
    box.append(el('p', 'Diff is percentage points of field goal % allowed: green means they held this opponent below their usual, red means they allowed more. Averages come from every other game they have played this season.', 'muted'));
    return box;
  }
  // Offence by court zone: every player's shots this season (pbp player rows) added up per team, ranked best (highest FG%) first.
  // Shots are counted for the club a player is on now, so a recent trade adds a little noise early in the season.
  const zoneTableOff = () => {
    const P = rows('pbp'), Td = P.filter((r) => r.k === 't'); if (!Td.length) return null;
    const by = {};
    P.filter((r) => r.k === 'p' && r.team && r.z).forEach((p) => {
      const o = by[p.team] || (by[p.team] = { team: p.team, n: (Td.find((t) => t.team === p.team) || {}).n || 0, z: {} });
      ZONES.forEach(([k]) => { const a = p.z[k]; if (!a) return; const q = o.z[k] || (o.z[k] = [0, 0]); q[0] += a[0]; q[1] += a[1]; });
    });
    const T = Object.values(by); if (T.length < 2) return null;
    const pct = (z) => (z && z[0] ? z[1] / z[0] : null), lg = {}, rk = {};
    ZONES.forEach(([k]) => {
      const a = T.reduce((t, x) => t + ((x.z[k] && x.z[k][0]) || 0), 0), m = T.reduce((t, x) => t + ((x.z[k] && x.z[k][1]) || 0), 0);
      lg[k] = a ? m / a : null;
      const order = T.filter((t) => pct(t.z[k]) != null).sort((x, y) => pct(y.z[k]) - pct(x.z[k])); // 1 = highest FG% (best offence)
      rk[k] = Object.fromEntries(order.map((t, i) => [t.team, i + 1]));
    });
    return { T, lg, rk, n: T.length, pct };
  };
  // One team's court for one mode: map, summary line and zone table.
  function zonePane(mode, Z, team, id, day) {
    const t = Z.T.find((x) => x.team === team); if (!t) return null;
    const off = mode === 'off', pane = el('div', null, 'dpane');
    const order = ZONES.map(([k, l]) => ({ k, l, r: Z.rk[k][team], p: Z.pct(t.z[k]), a: t.z[k] ? t.z[k][0] : 0 })).filter((z) => z.p != null && z.r);
    const nm = (z) => z.l.replace(/ \(.*\)/, '').toLowerCase(), pc = (z) => Math.round(z.p * 100) + '% ' + (off ? 'scored' : 'allowed') + ', #' + z.r;
    const weak = order.filter((z) => z.r > Z.n / 2).sort((x, y) => y.r - x.r).slice(0, 2), strong = order.slice().sort((x, y) => x.r - y.r)[0];
    pane.append(el('p', (weak.length ? 'Weakest: ' : 'No weak spot (every zone in the top half)') + weak.map((z) => nm(z) + ' (' + pc(z) + ')').join(' and ') + (strong ? '. ' + (off ? 'Best: ' : 'Toughest: ') + nm(strong) + ' (' + pc(strong) + ')' : '') + '.', 'dsum'));
    const svg = el('div', null, 'dsvg'); svg.innerHTML = courtSvg(team, Z, off ? 'Team shooting by zone' : 'Opponent shooting by zone'); pane.append(svg);
    const tb = el('table', null, 'dtbl'); const hr = el('tr'); ['Zone', off ? 'Scored' : 'Allowed', 'League', 'Shots', 'Rank'].forEach((h, j) => hr.append(el('th', h, j ? 'n' : ''))); tb.append(hr);
    order.forEach((z) => { const tr = el('tr'); const rkc = el('td', null, 'n'); rkc.append(el('span', '#' + z.r, 'drk ' + tier(z.r, Z.n))); tr.append(el('td', z.l), el('td', Math.round(z.p * 100) + '%', 'n'), el('td', Z.lg[z.k] != null ? Math.round(Z.lg[z.k] * 100) + '%' : '–', 'n'), el('td', (z.a / (t.n || 1)).toFixed(1), 'n'), rkc); tb.append(tr); });
    const w = el('div', null, 'scroll'); w.append(tb); pane.append(w);
    pane.append(el('p', 'From every shot in ESPN play-by-play this season (' + t.n + ' games' + (off ? ', counted for the players now on the team' : '') + '). Small samples early in the season.', 'muted'));
    if (!off) { const zg = zoneGame(team, id, day); if (zg) pane.append(zg); }
    return pane;
  }
  // The Teams-tab court card: a Defence / Offence switch on top, and the team buttons underneath (both kept per game).
  const DCSEL = {};
  function defCourt(id, day) {
    const ZD = zoneTable(); if (!ZD) return null;
    const ZO = zoneTableOff();
    const teams = String(id).split('-').filter((c) => ZD.T.some((t) => t.team === c)); if (!teams.length) return null;
    const sel = DCSEL[id] || (DCSEL[id] = { mode: 'def', cur: 0 });
    const INTRO = { def: 'What each defence allows from every part of the court this season: opponents\' field goal % (rank of 30, #1 = toughest). Green is a strength, red is where they are weakest.', off: 'What each offence scores from every part of the court this season: the team\'s own field goal % (rank of 30, #1 = best). Green is a strength, red is where they struggle.' };
    const card = el('div', null, 'card dcard'), h2 = el('h2', ''), intro = el('p', '', 'muted'), mt = el('div', null, 'nblut dmode'), tog = el('div', null, 'nblut'), panes = [];
    const show = () => {
      panes.forEach((p) => { p.el.hidden = !(p.mode === sel.mode && p.i === sel.cur); });
      tog.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === sel.cur));
      mt.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === sel.mode));
      h2.textContent = sel.mode === 'off' ? 'Offence by court zone' : 'Defence by court zone'; intro.textContent = INTRO[sel.mode];
    };
    if (!ZO) sel.mode = 'def';
    card.append(h2, intro);
    if (ZO) { [['def', 'Defence'], ['off', 'Offence']].forEach(([m, l]) => { const b = el('button', l); b.type = 'button'; b.dataset.m = m; b.addEventListener('click', (e) => { e.stopPropagation(); sel.mode = m; show(); }); mt.append(b); }); card.append(mt); }
    teams.forEach((team, i) => {
      [['def', ZD], ['off', ZO]].forEach(([m, Z]) => { if (!Z) return; const pn = zonePane(m, Z, team, id, day); if (pn) { panes.push({ el: pn, mode: m, i }); card.append(pn); } });
      const b = el('button', null); b.type = 'button'; b.append(X.badge(team), document.createTextNode(team)); b.addEventListener('click', (e) => { e.stopPropagation(); sel.cur = i; show(); }); tog.append(b);
    });
    if (sel.cur >= teams.length) sel.cur = 0;
    card.append(tog); show();
    return card;
  }

  // ---- Teams tab: one tab per team (instead of both teams' stats stacked), remembered per game.
  const TMSEL = {};
  function teamTabs(grid, teams) {
    const cards = [...grid.children].filter((c) => c.classList.contains('card')); if (cards.length < 2 || !teams || teams.length < 2) return;
    const key = teams[0].game || teams.map((t) => t.team).join('-');
    const tog = el('div', null, 'nblut tmtog');
    const show = (i) => { TMSEL[key] = i; cards.forEach((c, j) => { c.hidden = j !== i; }); tog.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i)); };
    teams.forEach((t, i) => { const b = el('button'); b.type = 'button'; b.append(X.badge(t.team), document.createTextNode(t.team + ' (' + String(t.role).toLowerCase() + ')')); b.addEventListener('click', (e) => { e.stopPropagation(); show(i); }); tog.append(b); });
    grid.classList.add('tmtab'); grid.prepend(tog); show(TMSEL[key] < cards.length ? TMSEL[key] || 0 : 0);
  }

  // ---- Review: "Our track record" is a dropdown (closed by default); its heading line shows the one-line summary.
  dash.draw('trackrecsum', (box) => {
    const g = dash.data('valuelog'), all = g.status === 'ok' && Array.isArray(g.data) ? g.data : [], done = all.filter((x) => x.status === 'won' || x.status === 'lost');
    box.textContent = done.length ? done.length + ' bets · won ' + Math.round((100 * done.filter((x) => x.status === 'won').length) / done.length) + '%' : 'Nothing settled yet';
  });


  // ---- NRL and AFL: shown in the Games tab as off-season until their 2027 seasons start. Stats arrive with the season.
  (() => {
    window.TAB_ICONS = window.TAB_ICONS || {};
    window.TAB_ICONS.nrl = 'data:image/png;base64,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';
    window.TAB_ICONS.afl = 'data:image/png;base64,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';
  })();
  const OFF = {
    nrl: { name: 'NRL', full: 'National Rugby League', when: 'March 2027', list: ['Live scores and full match stats', 'Try-scorer and player stat hit rates', 'Team form, the ladder and head to head', 'Injuries and team lists each round'] },
    afl: { name: 'AFL', full: 'Australian Football League', when: 'March 2027', list: ['Live scores and full match stats', 'Goal-kicker, disposal and mark hit rates', 'Team form, the ladder and head to head', 'Injuries and team lists each round'] },
  };
  dash.draw('offview', (box) => {
    const d = OFF[box.closest('#view-off') && box.closest('#view-off').dataset.sp] || OFF.nrl;
    const card = el('div', null, 'card offcard');
    const top = el('div', null, 'offtop'), ic = el('span', null, 'offic'); if (window.TAB_ICONS) { const im = document.createElement('img'); im.alt = ''; im.src = window.TAB_ICONS[d === OFF.afl ? 'afl' : 'nrl']; ic.append(im); }
    const nm = el('div'); nm.append(el('h2', d.name), el('span', d.full, 'muted'));
    top.append(ic, nm, el('span', 'Offseason', 'offpill'));
    card.append(top, el('p', 'The ' + d.name + ' is in its off-season. The 2027 season starts in ' + d.when + ' (dates to be announced). Fixtures, live scores and a full stats page for every match will appear here from round 1.', 'offtxt'));
    card.append(el('div', 'Coming with the new season', 'bbday bbsub'));
    const ul = el('ul', null, 'offlist'); d.list.forEach((t) => ul.append(el('li', t))); card.append(ul);
    box.replaceChildren(card);
  });

  // ---- Review title ticker: "What we got right and wrong" slides off the left edge and comes back in from the right, non-stop,
  // across the whole width of the screen. The text is repeated until one half of the track is wider than the screen, so the
  // -50% slide loops with no gap (rebuilt when the window size changes); it stands still for "reduce motion".
  (() => {
    const h = document.querySelector('#view-rv .hero h1'); if (!h || h.dataset.mq) return;
    const t = h.textContent.trim(); h.dataset.mq = '1'; h.setAttribute('aria-label', t); h.classList.add('mqh');
    const build = () => {
      const W = Math.max(h.clientWidth, window.innerWidth, 320);
      const probe = el('span', t, 'mqi'); h.replaceChildren(probe);
      const w = probe.getBoundingClientRect().width || 300, n = Math.max(1, Math.ceil(W / w) + 1);
      const tr = el('span', null, 'mqtrack'); tr.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < n * 2; i++) tr.append(el('span', t, 'mqi'));
      tr.style.animationDuration = Math.max(10, Math.round((w * n) / 55)) + 's'; // about 55 px a second, same speed on any screen
      h.replaceChildren(tr);
    };
    build();
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(build); } catch (e) { /* fonts API missing */ }
    let rt = 0; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(build, 200); });
  })();

  // ---- Full box score: every usual stat for one team. The player column stays put and the rest swipes sideways.
  // Rows come from the live feed (bxLive) or from the saved finished-game box (already plain numbers); extra columns
  // (offensive / defensive rebounds, plus-minus) only show when the data has them.
  const bxN = (v) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };
  const bxPair = (t) => { const m = String(t || '').match(/^(\d+)-(\d+)$/); return m ? [Number(m[1]), Number(m[2])] : [null, null]; };
  const bxLive = (p) => {
    const s = p.s || {}, [fgm, fga] = bxPair(s['fieldGoalsMade-fieldGoalsAttempted']), [tpm, tpa] = bxPair(s['threePointFieldGoalsMade-threePointFieldGoalsAttempted']), [ftm, fta] = bxPair(s['freeThrowsMade-freeThrowsAttempted']);
    return { name: p.player, starter: String(p.starter) === 'true', min: bxN(s.minutes), pts: bxN(s.points), reb: bxN(s.rebounds), ast: bxN(s.assists), stl: bxN(s.steals), blk: bxN(s.blocks), tov: bxN(s.turnovers), pf: bxN(s.fouls), oc: String(s.oc) === '1', fgm, fga, tpm, tpa, ftm, fta, orb: bxN(s.offensiveRebounds), drb: bxN(s.defensiveRebounds), pm: bxN(s.plusMinus) };
  };
  function boxTable(list) {
    const has = (k) => list.some((p) => p[k] != null);
    const sum = (k) => list.reduce((t, p) => t + (Number(p[k]) || 0), 0);
    const v = (n) => (n == null ? '–' : String(n)), pr = (m, a) => (m == null || !a ? '–' : (Math.round((m / a) * 1000) / 10).toFixed(1)), pm = (n) => (n == null ? '–' : (n > 0 ? '+' : '') + n);
    const COLS = [
      ['MIN', (p) => v(p.min), (L) => sum('min')], ['PTS', (p) => v(p.pts), () => sum('pts')], ['REB', (p) => v(p.reb), () => sum('reb')], ['AST', (p) => v(p.ast), () => sum('ast')],
      ['STL', (p) => v(p.stl), () => sum('stl')], ['BLK', (p) => v(p.blk), () => sum('blk')], ['TO', (p) => v(p.tov), () => sum('tov')], ['PF', (p) => v(p.pf), () => sum('pf')],
      ['FG', (p) => (p.fga == null ? '–' : p.fgm + '-' + p.fga), () => sum('fgm') + '-' + sum('fga')], ['FG%', (p) => pr(p.fgm, p.fga), () => pr(sum('fgm'), sum('fga'))],
      ['3PT', (p) => (p.tpa == null ? '–' : p.tpm + '-' + p.tpa), () => sum('tpm') + '-' + sum('tpa')], ['3P%', (p) => pr(p.tpm, p.tpa), () => pr(sum('tpm'), sum('tpa'))],
      ['FT', (p) => (p.fta == null ? '–' : p.ftm + '-' + p.fta), () => sum('ftm') + '-' + sum('fta')], ['FT%', (p) => pr(p.ftm, p.fta), () => pr(sum('ftm'), sum('fta'))],
    ];
    if (has('orb')) COLS.push(['OREB', (p) => v(p.orb), () => sum('orb')]);
    if (has('drb')) COLS.push(['DREB', (p) => v(p.drb), () => sum('drb')]);
    if (has('pm')) COLS.push(['+/-', (p) => pm(p.pm), () => '']);
    const t = el('table', null, 'lvbox fullbox'), hr = el('tr'); hr.append(el('th', 'Player')); COLS.forEach(([h]) => hr.append(el('th', h, 'n'))); t.append(hr);
    const grouped = list.some((p) => p.starter != null); let last = null;
    list.forEach((p) => {
      if (grouped && !!p.starter !== last) { last = !!p.starter; const sr = el('tr', null, 'lvgrp'), td = el('td'); td.colSpan = COLS.length + 1; td.append(el('span', last ? 'Starters' : 'Bench', 'lvgl')); sr.append(td); t.append(sr); }
      const tr = el('tr'), nm = el('td'), nb = el('b', String(p.name || '').replace(/^(\S)\S*\s+(?=\S)/, '$1. ')); nb.title = p.name || ''; if (p.oc) { const dt = el('i', null, 'ocdot'); dt.title = 'On the court now'; nm.append(dt); } nm.append(nb); tr.append(nm);
      COLS.forEach(([, f]) => tr.append(el('td', f(p), 'n'))); t.append(tr);
    });
    const tt = el('tr', null, 'lvtot'); tt.append(el('td', 'Team')); COLS.forEach(([, , f]) => tt.append(el('td', String(f()), 'n'))); t.append(tt);
    return t;
  }

  // ---- Instant results: a game that is full time in the live feed is graded right away in the browser, with the
  // same rules as scripts/grade.js. The cloud grades it officially a few minutes later and its row replaces ours.
  const nday = (d) => String(d || '').replace(/^(\w+) 0(\d) /, '$1 $2 ').trim();
  const tHit = (lean, total, line) => { if (!Number.isFinite(total) || !Number.isFinite(Number(line)) || !/over|under/i.test(lean || '')) return ''; if (total === Number(line)) return 'push'; return (/over/i.test(lean) ? total > line : total < line) ? 'hit' : 'miss'; };
  const tkn = (h) => (h === 'hit' ? '✓' : h === 'miss' ? '✗' : '');
  const NOTE = ' Graded from the live final score; the official grade confirms it shortly.';
  function provisional(off) {
    const hist = [], fin = [];
    const have = new Set(off.filter((h) => h.status === 'Final').map((h) => (h.sport || 'nba') + '|' + h.id + '|' + nday(h.date)));
    const post = liveRows('livegames').filter((r) => r.state === 'post');
    post.filter((r) => r.sport === 'nba').forEach((r) => {
      const day = dayKey(new Date(r.start_time)), id = r.game_id; if (have.has('nba|' + id + '|' + day)) return;
      const g = rows('games').find((x) => x.id === id && nday(x.date) === day), p = rows('pred').find((x) => x.id === id); if (!g || !p || g.away !== r.away_code || g.home !== r.home_code) return;
      const ap = sc(r.away_score), hp = sc(r.home_score), [an, hn] = String(p.matchup || g.matchup || '').split(' @ '), win = ap > hp ? g.away : g.home;
      const row = { sport: 'nba', date: day, id, away: g.away, home: g.home, away_name: an || g.away, home_name: hn || g.home, kick: String(g.time || '').toLowerCase(), status: 'Final', away_pts: ap, home_pts: hp, pick: p.ml_pick || p.winner, pick_pct: p.ml_final_prob, conf: p.combined_conf || p.confidence, total_lean: p.total_lean, posted_total: p.posted_total != null ? p.posted_total : g.total, proj_total: p.proj_total, winner_hit: '', total_hit: '', auto: true, provisional: true };
      row.winner_hit = win === row.pick ? 'hit' : 'miss'; row.total_hit = tHit(row.total_lean, ap + hp, row.posted_total);
      row.verdict = tkn(row.winner_hit) + ' Picked ' + row.pick + ' (' + row.pick_pct + '%, ' + row.conf + '): ' + win + ' won ' + Math.max(ap, hp) + '-' + Math.min(ap, hp) + '.' + (row.total_hit ? ' ' + tkn(row.total_hit) + ' ' + row.total_lean + ' ' + row.posted_total + ': total was ' + (ap + hp) + '.' : '') + NOTE;
      row.factors = p.margin != null ? ['Margin: we projected ' + p.winner + ' by ' + p.margin + '; actual ' + win + ' by ' + Math.abs(ap - hp) + '.'] : [];
      hist.push(row); fin.push({ id, status: 'Final', away_pts: ap, home_pts: hp, note: '', date: day, provisional: true });
    });
    post.filter((r) => r.sport === 'nfl').forEach((r) => {
      const g = rows('nflgames').find((x) => x.id === r.game_id); if (!g) return;
      const day = nday(String(g.kick).split(',')[0]); if (have.has('nfl|' + g.id + '|' + day)) return;
      const ap = sc(r.away_score), hp = sc(r.home_score), win = ap > hp ? g.away : hp > ap ? g.home : 'TIE';
      const row = { sport: 'nfl', date: day, id: g.id, away: g.away, home: g.home, away_name: g.away_name, home_name: g.home_name, kick: String(g.kick).split(',').slice(1).join(',').trim(), status: 'Final', away_pts: ap, home_pts: hp, pick: g.pick, pick_pct: g.pick_pct, conf: g.conf, total_lean: g.total_lean, posted_total: g.total, proj_total: g.proj_total, spread_pick: g.cover_pick || g.ats_pick || '', spread_home: g.spread_home, winner_hit: win === g.pick ? 'hit' : 'miss', total_hit: tHit(g.total_lean, ap + hp, g.total), spread_hit: '', auto: true, provisional: true };
      if (row.spread_pick && Number.isFinite(Number(g.spread_home))) { const ats = hp + Number(g.spread_home) - ap; row.spread_hit = ats === 0 ? 'push' : (ats > 0 ? g.home : g.away) === row.spread_pick ? 'hit' : 'miss'; }
      row.verdict = tkn(row.winner_hit) + ' Picked ' + g.pick + ' (' + g.pick_pct + '%, ' + g.conf + '): ' + (win === 'TIE' ? 'tie' : win + ' won') + ' ' + Math.max(ap, hp) + '-' + Math.min(ap, hp) + '.' + (row.total_hit ? ' ' + tkn(row.total_hit) + ' ' + g.total_lean + ' ' + g.total + ': total ' + (ap + hp) + '.' : '') + (row.spread_hit ? ' ' + tkn(row.spread_hit) + ' Spread pick ' + row.spread_pick + '.' : '') + NOTE;
      row.factors = g.proj_home != null ? ['Score: we projected ' + g.home + ' ' + g.proj_home + ' - ' + g.away + ' ' + g.proj_away + '; final ' + g.home + ' ' + hp + ' - ' + g.away + ' ' + ap + '.'] : [];
      hist.push(row);
    });
    const table = rows('table');
    const codeOf = (name, league) => { const t = table.find((q) => q.team === name && q.league === league) || table.find((q) => q.team === name); return t ? t.abbr : String(name).slice(0, 3).toUpperCase(); };
    rows('fixtures').forEach((x) => {
      const r = post.find((q) => q.sport === 'fb' && nsim(q.home_name, x.home) && nsim(q.away_name, x.away)); if (!r) return;
      const day = nday(String(x.time).split(',')[0]); if (have.has('fb|' + x.id + '|' + day)) return;
      const hc = codeOf(x.home, x.league), ac = codeOf(x.away, x.league), hg = sc(r.home_score), ag = sc(r.away_score), tot = hg + ag, both = hg > 0 && ag > 0;
      const pickSide = /draw/i.test(x.pick) ? 'Draw' : x.pick.indexOf(x.home) === 0 ? hc : ac, resSide = hg > ag ? hc : ag > hg ? ac : 'Draw';
      const row = { sport: 'fb', league: x.league, date: day, id: x.id, away: ac, home: hc, away_name: x.away, home_name: x.home, kick: String(x.time).split(',').slice(1).join(',').replace(/\s*AEDT/, '').trim().toLowerCase(), status: 'Final', away_pts: ag, home_pts: hg, pick: pickSide, pick_text: x.pick, pick_pct: x.pick_pct, conf: x.confidence, gp_pick: x.goals_play && x.goals_play.pct ? x.goals_play.pick : '', gp_pct: x.goals_play ? x.goals_play.pct : null, gp_hit: '', btts_pick: x.btts_pick, p_btts: x.p_btts, ou_pick: x.ou_pick, p_o25: x.p_o25, total_lean: /over|under/i.test(x.ou_pick) ? x.ou_pick : 'Coin toss', posted_total: 2.5, proj_total: x.xg_total, proj_score: x.proj_score, winner_hit: resSide === pickSide ? 'hit' : 'miss', total_hit: '', btts_hit: '', auto: true, provisional: true };
      if (row.gp_pick) { const ok = { 'Over 1.5': tot > 1, 'Under 1.5': tot < 2, 'Over 2.5': tot > 2, 'Under 2.5': tot < 3, 'Over 3.5': tot > 3, 'Under 3.5': tot < 4, 'Both score': both, 'Not both': !both }[row.gp_pick]; row.gp_hit = ok == null ? '' : ok ? 'hit' : 'miss'; }
      row.btts_hit = /^(Both score|Not both)$/.test(x.btts_pick || '') ? ((x.btts_pick === 'Both score') === both ? 'hit' : 'miss') : '';
      row.total_hit = tHit(row.total_lean.replace(' 2.5', ''), tot, 2.5);
      row.verdict = (row.gp_hit ? tkn(row.gp_hit) + ' Main play ' + row.gp_pick + ' (' + row.gp_pct + '%). ' : '') + tkn(row.winner_hit) + ' Picked ' + x.pick + ' (' + x.pick_pct + '%, ' + x.confidence + '): finished ' + x.home + ' ' + hg + '-' + ag + ' ' + x.away + '. ' + (row.btts_hit ? tkn(row.btts_hit) + ' ' + x.btts_pick + '.' : '') + (row.total_hit ? ' ' + tkn(row.total_hit) + ' ' + x.ou_pick + '.' : '') + NOTE;
      row.factors = ['Score: we projected ' + x.proj_score + ', it finished ' + hg + '-' + ag + '.'];
      hist.push(row);
    });
    return { hist, fin };
  }
  // Called by the page's rows() for the `history` and `final` datasets.
  function merge(id, base) {
    const raw = dash.data('history'), off = raw.status === 'ok' && Array.isArray(raw.data) ? raw.data : [];
    const P = provisional(off); if (!P.hist.length) return base;
    const key = (h) => (h.sport || 'nba') + '|' + h.id + '|' + nday(h.date), keys = new Set(P.hist.map(key));
    if (id === 'history') return base.filter((h) => !keys.has(key(h))).concat(P.hist);
    if (id === 'final') { const ids = new Set(P.fin.map((f) => f.id + '|' + f.date)); return base.filter((f) => !(f.status !== 'Final' && ids.has(f.id + '|' + nday(f.date)))).concat(P.fin); }
    return base;
  }

  // ---- Slip ticks: the plays from the owner's logged bets that sit on a finished game, green tick if they landed,
  // red cross if not (bets are private to the owner's Mac, so the public site never has any).
  function legState(l, h) {
    if (l.status === 'won') return 'hit'; if (l.status === 'lost') return 'miss'; if (l.status === 'void') return '';
    if (!h || h.status !== 'Final' || h.home_pts == null) return '';
    const hp = Number(h.home_pts), ap = Number(h.away_pts), tot = hp + ap, pick = String(l.pick || ''); let m;
    if ((m = pick.match(/^(Over|Under) ([\d.]+)/i)) && (l.market === 'Total' || l.market === 'Goals')) { const L = Number(m[2]); return tot === L ? '' : (/over/i.test(m[1]) ? tot > L : tot < L) ? 'hit' : 'miss'; }
    if (l.market === 'Winner') { if (/^draw$/i.test(pick)) return hp === ap ? 'hit' : 'miss'; const team = pick.replace(/ win$/i, ''); const home = nsim(team, h.home_name) || team === h.home; const away = nsim(team, h.away_name) || team === h.away; if (!home && !away) return ''; return hp === ap ? 'miss' : (home ? hp > ap : ap > hp) ? 'hit' : 'miss'; }
    if (l.market === 'Spread' && (m = pick.match(/^(.*) ([+-][\d.]+)$/))) { const home = nsim(m[1], h.home_name); const mg = (home ? hp - ap : ap - hp) + Number(m[2]); return mg === 0 ? '' : mg > 0 ? 'hit' : 'miss'; }
    return '';
  }
  function slipChips(h) {
    const out = [];
    return out;
    betRows().forEach((b) => {
      const legs = legsOf(b) || [b];
      legs.forEach((l) => {
        if (!(l.sp === (h.sport || 'nba') && l.game === h.id && nday(l.date) === nday(h.date))) return;
        const st = legState(l, h); const c = el('span', 'Slip: ' + l.pick, 'chip slipchip ' + (st || 'open'));
        c.append(el('span', st === 'hit' ? '✓' : st === 'miss' ? '✕' : '–', 'mk ' + (st || 'na')));
        c.title = (legs.length > 1 ? legs.length + ' leg multi' : 'Single') + ' · $' + Number(b.stake || 0).toFixed(2) + ' @ ' + Number(b.price || 0).toFixed(2) + (st ? (st === 'hit' ? ' · landed' : ' · lost') : ' · waiting for the result');
        out.push(c);
      });
    });
    return out;
  }

  // ---- Home: live now / next up, pick of the day, game of the night, injury alerts.
  // They follow the same day as Best bets (today, or tomorrow from 4 pm).
  const homeGroup = () => { try { return bestBets()[0] || null; } catch (e) { return null; } };
  const fmtLeft = (ms) => { const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? d + 'd ' + (h % 24) + 'h' : h ? h + 'h ' + (m % 60) + 'm' : m + 'm'; };
  const openPick = (i) => { const f = i.m.finder; if (f && f.side && window.SSPP) window.SSPP.focus(i.sp, f.stat, f.line, f.player, f.pid); else X.openGame(i.sp, i.id, i.day); };
  dash.draw('hslive', (box) => {
    clearInterval(box._t);
    const live = liveRows('livegames').filter((r) => r.state === 'in');
    if (live.length) {
      const row = el('div', null, 'hlrow');
      live.forEach((r) => {
        const c = el('button', null, 'hlc'); c.type = 'button';
        const top = el('div', null, 'hlt'); top.append(el('span', 'LIVE', 'hlive'), el('span', r.status_text || '', 'muted'));
        if (r.sport === 'ufc') { // fights: names only, no photo circle and no score
          const f = rows('ufcfights').find((q) => (nsim(q.a, r.away_name) && nsim(q.b, r.home_name)) || (nsim(q.a, r.home_name) && nsim(q.b, r.away_name)));
          const nm = (n) => { const d = el('div', null, 'hls'); d.append(el('b', n)); return d; };
          c.classList.add('hlu'); c.append(top, nm(r.away_name), nm(r.home_name)); c.addEventListener('click', () => { if (f) X.openGame('ufc', f.id, ''); }); row.append(c); return;
        }
        const side = (code, name, pts) => { const d = el('div', null, 'hls'); d.append(r.sport === 'nba' ? X.badge(code) : X.bdX(code), el('b', code || name), el('span', String(pts == null ? 0 : pts))); return d; };
        c.append(top, side(r.away_code, r.away_name, r.away_score), side(r.home_code, r.home_name, r.home_score));
        c.addEventListener('click', () => X.openGame(r.sport, r.game_id, dayKey(new Date(r.start_time)))); row.append(c);
      });
      box.replaceChildren(el('div', 'Live now · ' + live.length, 'hhl'), row); return;
    }
    const now = Date.now(), nx = rows('schedule').filter((x) => x.iso && new Date(x.iso).getTime() > now).sort((a, b) => (a.iso < b.iso ? -1 : 1))[0];
    if (!nx) { box.replaceChildren(); return; }
    const t = new Date(nx.iso).getTime(), c = el('button', null, 'hnext'); c.type = 'button';
    const lab = el('span', null, 'hnl'); lab.append(el('b', 'Next up'), document.createTextNode(' · ' + (nx.sport === 'fb' ? nx.home_name + ' v ' + nx.away_name : nx.away_name + ' @ ' + nx.home_name) + ' · ' + nx.kick));
    const cd = el('b', 'in ' + fmtLeft(t - now), 'hncd'); c.append(lab, cd);
    c.addEventListener('click', () => X.openGame(nx.sport, nx.id, nx.date));
    box.replaceChildren(c);
    box._t = setInterval(() => { const left = t - Date.now(); if (left <= 0) { clearInterval(box._t); dash.draw('hslive'); return; } cd.textContent = 'in ' + fmtLeft(left); }, 30000);
  });
  // Stat of the day: the player stat with the best season hit rate, leaving out anything with injury news or a
  // big gap to the bookie (those can mean the bookie knows something).
  dash.draw('hpod', (box) => {
    const sec = box.closest('section');
    if (!bbReady()) { if (sec) sec.classList.toggle('isempty', false); box.replaceChildren(skel(1)); return; }
    const g = homeGroup();
    const ok = (g ? [...(g.bprops || [])] : []).filter((i) => PUB || (i.m.price >= 1.3 && !i.m.est)).filter((i) => { const f = i.m.finder; return !(f && f.why && f.why.some((w) => /big gap/.test(w))) && !(f && f.side && injOf(i.sp, f)); });
    const best = ok.sort((a, b) => (hitPct(b) || 0) - (hitPct(a) || 0) || b.m.chance - a.m.chance)[0];
    if (sec) sec.classList.toggle('isempty', !best); if (!best) { box.replaceChildren(); return; }
    const f = best.m.finder, c = el('button', null, 'hpodc'); c.type = 'button';
    const ic = bbIcon(best); ic.classList.add('big');
    const mid = el('div', null, 'hpm'); mid.append(el('span', g.key + (best.time ? ' · ' + best.time : ''), 'hpd'), el('b', best.m.pick, 'hpp'),
      el('span', f && f.side ? 'Over this line in ' + f.hit + ' games this season · avg ' + f.avg + ', last ' + (f.sp === 'nfl' ? 3 : 5) + ' ' + f.l5 : best.match, 'hpr'));
    const r = el('div', null, 'hpv'); const bh = hitPct(best); r.append(el('b', (bh == null ? best.m.chance : bh) + '%', 'c ' + conf(bh == null ? best.m.chance : bh)), el('span', PUB || !best.m.price ? '' : '$' + best.m.price.toFixed(2) + (best.m.book ? ' ' + best.m.book.replace(' (AU)', '') : '')));
    c.append(ic, mid, r); c.addEventListener('click', () => openPick(best));
    box.replaceChildren(c);
  });
  // Game of the night: the best matchup on the slate (two strong records, a close projected margin).
  dash.draw('hgotn', (box) => {
    const sec = box.closest('section'), g = homeGroup(), day = g && g.key;
    const games = day ? rows('games').filter((x) => x.date === day && rows('pred').some((p) => p.id === x.id)) : [];
    const recOf = (id, code) => (rows('teams').find((t) => t.game === id && t.team === code) || {}).record || '';
    const wp = (rec) => { const m = String(rec).match(/(\d+)-(\d+)/); return m && +m[1] + +m[2] ? +m[1] / (+m[1] + +m[2]) : 0.5; };
    const top = games.map((x) => { const p = rows('pred').find((q) => q.id === x.id); return { x, p, s: wp(recOf(x.id, x.away)) + wp(recOf(x.id, x.home)) - Math.abs(Number(p.margin) || 0) / 15 }; }).sort((a, b) => b.s - a.s)[0];
    if (sec) sec.classList.toggle('isempty', !top); if (!top) { box.replaceChildren(); return; }
    const { x, p } = top, [an, hn] = String(x.matchup).split(' @ '), c = el('button', null, 'hgc'); c.type = 'button';
    const side = (code, name) => { const d = el('div', null, 'hgs'); d.append(X.badge(code), el('b', name || code), el('span', recOf(x.id, code), 'muted')); return d; };
    const mid = el('div', null, 'hgm'); mid.append(el('span', day + ' · ' + x.time), el('b', p.winner + ' by ' + Number(p.margin).toFixed(1)), el('span', (p.ml_final_prob ? p.ml_final_prob + '% to win · ' : '') + 'total ' + x.total, 'muted'));
    c.append(side(x.away, an), mid, side(x.home, hn)); c.addEventListener('click', () => X.openGame('nba', x.id, day));
    box.replaceChildren(c);
  });
  // New injuries: key players (12+ points or 25+ minutes a game this season) with an injury report in the last
  // 2 days for the coming games, and which of our picks are in their game. Older injuries are on the player pages.
  dash.draw('hinj', (box) => {
    const sec = box.closest('section'), g = homeGroup(), day = g && g.key;
    const games = day ? rows('games').filter((x) => x.date === day) : [];
    const teams = new Map(games.flatMap((x) => [[x.away, x], [x.home, x]]));
    const pgl = rows('pgl'); const cur = pgl.slice(0, 50).map((r) => String(r.g || '').split(',')[1] || '').sort().pop();
    const avgOf = (pid) => { const r = pgl.find((q) => String(q.pid) === String(pid)); if (!r) return null; const gs = String(r.g || '').split(';').map((v) => v.split(',')).filter((v) => v[1] === cur && +v[7] > 0 && v[21] !== '1'); return gs.length < 2 ? null : { pts: gs.reduce((t, v) => t + +v[8], 0) / gs.length, min: gs.reduce((t, v) => t + +v[7], 0) / gs.length }; };
    const picks = g ? [...g.plays, ...(g.alts || []), ...(g.bprops || [])] : [];
    const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10); // reported in the last 2 days
    const list = [];
    rows('troster').filter((t) => t.sp === 'nba' && teams.has(t.code)).forEach((t) => (t.inj || []).forEach((i) => {
      if (!/out|doubt|day|ques/i.test(i[3] || '') || !(i[6] && i[6] >= since)) return; const a = avgOf(i[0]); if (!a || (a.pts < 12 && a.min < 25)) return;
      const gm = teams.get(t.code), inGame = picks.filter((it) => it.sp === 'nba' && it.id === gm.id);
      list.push({ pid: i[0], name: i[1], team: t.code, status: i[3], what: i[4] || '', note: i[7] || '', a, gm, own: inGame.filter((it) => it.m.finder && it.m.finder.player === i[1]).length, game: inGame.filter((it) => !it.m.finder).map((it) => it.m.pick), props: inGame.filter((it) => it.m.finder && it.m.finder.player !== i[1]).length });
    }));
    list.sort((x, y) => (y.own + y.game.length + y.props ? 1 : 0) - (x.own + x.game.length + x.props ? 1 : 0) || y.a.pts - x.a.pts);
    if (sec) sec.classList.toggle('isempty', !list.length); if (!list.length) { box.replaceChildren(); return; }
    const out = list.slice(0, 6).map((x) => {
      const r = el('button', null, 'hir'); r.type = 'button';
      const t = el('div', null, 'hit'); t.append(el('b', x.name), el('span', x.team + ' · ' + x.a.pts.toFixed(1) + ' pts, ' + Math.round(x.a.min) + ' min a game · ' + x.gm.matchup, 'muted'));
      const aff = [x.own ? 'his prop' : '', ...x.game, x.props ? x.props + (x.props === 1 ? ' prop' : ' props') : ''].filter(Boolean);
      if (x.note) t.append(el('span', x.note, 'hinote'));
      if (aff.length) t.append(el('span', 'Affects ' + aff.join(' + '), 'hiaff'));
      const lab = /out/i.test(x.status) ? 'OUT' : /doubt/i.test(x.status) ? 'DOUBTFUL' : 'DAY-TO-DAY';
      r.append(X.avatar('nba', x.pid, x.name), t, el('span', lab, 'hist ' + (lab === 'OUT' ? 'out' : 'dbt')));
      r.addEventListener('click', () => X.openPlayer(x.name)); return r;
    });
    box.replaceChildren(...out, ...(list.length > 6 ? [el('p', '+' + (list.length - 6) + ' more on the team pages', 'muted bbnote')] : []));
  });
  // keep the countdown and live strip fresh when the live feed updates
  // ---- News (news.json, ESPN headlines; the local server refreshes it every 30 minutes)
  const newsRows = () => { const g = dash.data('news'); return g.status === 'ok' && Array.isArray(g.data) ? g.data : []; };
  const ago = (iso) => { const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago'; };
  // players in the news in the last 24 hours, by ESPN id (the same ids as our player data)
  const newsOf = (pid) => { if (pid == null) return []; const cut = Date.now() - 86400000; return newsRows().filter((x) => new Date(x.published).getTime() > cut && (x.athletes || []).some((a) => a[0] === String(pid))); };
  const newsItem = (x) => {
    const a = el('a', null, 'nwi'); a.href = x.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
    const th = el('span', null, 'nwth' + (x.video ? ' vid' : '')); if (x.img) { const im = document.createElement('img'); im.src = x.img; im.alt = ''; im.loading = 'lazy'; th.append(im); }
    const t = el('span', null, 'nwt'); t.append(el('b', x.headline), el('small', x.league + ' · ' + ago(x.published) + (x.video ? ' · video' : '')));
    a.append(th, t); return a;
  };
  const NWF = { sp: 'all', more: false };
  dash.draw('hnews', (box) => {
    const sec = box.closest('section'), all = newsRows();
    if (sec) sec.classList.toggle('isempty', !all.length); if (!all.length) { box.replaceChildren(); return; }
    const SPN = { nba: 'NBA', nfl: 'NFL', fb: 'Football', ufc: 'UFC' }, sps = Object.keys(SPN).filter((k) => all.some((x) => x.sp === k));
    const chips = el('div', null, 'bbchips');
    const chip = (lab, k) => { const c = el('button', lab, 'bbchip' + (NWF.sp === k ? ' on' : '')); c.type = 'button'; c.addEventListener('click', () => { NWF.sp = k; NWF.more = false; dash.draw('hnews'); }); return c; };
    chips.append(chip('All', 'all'), ...sps.map((k) => chip(SPN[k], k)));
    const list = all.filter((x) => NWF.sp === 'all' || x.sp === NWF.sp), shown = list.slice(0, NWF.more ? 20 : 6);
    const out = [chips, ...shown.map(newsItem)];
    if (list.length > shown.length) { const m = el('button', 'More headlines ›', 'bbmore'); m.type = 'button'; m.addEventListener('click', () => { NWF.more = true; dash.draw('hnews'); }); out.push(m); }
    box.replaceChildren(...out);
  });
  // fresh headlines while the page stays open
  setInterval(() => { try { dash.refresh('news'); } catch (e) { /* not loaded */ } }, 10 * 60000);

  // Confidence colours on game cards everywhere (green 70%+, amber 60-69%, grey below), same as the Bets tab.
  // Cards already showing a result (won / lost) keep their result colours.
  const tintAll = () => document.querySelectorAll('.hg .pk:not([data-ct]), .gcard .pk:not([data-ct])').forEach((p) => {
    p.dataset.ct = '1'; const card = p.closest('.hg, .gcard'); if (card && /\b(won|lost|rgres|lvdone)\b/.test(card.className)) return;
    const m = p.textContent.match(/(\d+(?:\.\d+)?)%/); if (!m) return; const v = +m[1]; p.classList.add(v >= 70 ? 'cHi' : v >= 60 ? 'cMd' : 'cLo'); });
  new MutationObserver(() => { clearTimeout(tintAll.t); tintAll.t = setTimeout(tintAll, 60); }).observe(document.body, { childList: true, subtree: true });
  window.SSG = { boxTable, newsOf, newsItem, teamTabs, defCourt, b2bCard, b2bInfo, gameBets, ufcMethods, ufcTabs, liveHome, betPill, candidates, mainCard, pickMain, liveCard, liveDecor, liveUfc, liveUfcHome, ufcLiveCard, pastFight, ufcLive, merge, slipChips, provisional };
})();
