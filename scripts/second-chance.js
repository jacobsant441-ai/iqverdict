// Second-chance points from ESPN's play-by-play: points a team scores after one of its offensive rebounds,
// until the other team gets the ball (made shot, last free throw, their rebound, a turnover, end of period).
// Returns { [teamId]: points }. ESPN's box score feed does not publish this number.
function secondChance(plays) {
  const sc = {}; let active = null, tail = null, prevFt = null; // active: team on a second chance; tail: team that just scored it (and-one free throw can still count)
  for (const p of plays || []) {
    const t = (p.type && p.type.text) || '', tid = p.team && p.team.id != null ? String(p.team.id) : null;
    const ft = /^Free Throw/i.test(t); const pf = prevFt; prevFt = ft && !p.scoringPlay ? t : null;
    if (/offensive (team )?rebound/i.test(t)) {
      const m = pf && /(\d) of (\d)/.exec(pf); // a rebound after a missed first free throw is a dead ball, not a second chance
      if (tid && !(m && m[1] !== m[2])) { active = tid; tail = null; }
      continue;
    }
    if (tail && ft && p.scoringPlay && tid === tail) { sc[tail] = (sc[tail] || 0) + (Number(p.scoreValue) || 0); continue; }
    if (tail && /foul/i.test(t) && !/offensive foul/i.test(t)) continue; // the foul on an and-one
    tail = null;
    if (!active) continue;
    if (/end (period|game)/i.test(t)) { active = null; continue; }
    if (/defensive (team )?rebound/i.test(t)) { active = null; continue; }
    if (p.scoringPlay) {
      if (tid !== active) { active = null; continue; }
      sc[active] = (sc[active] || 0) + (Number(p.scoreValue) || 0);
      if (ft) { const m = /(\d) of (\d)/.exec(t); if (m && m[1] === m[2]) active = null; } else { tail = active; active = null; }
      continue;
    }
    if (/turnover|traveling|offensive foul|double dribble|3 second|3-second|backcourt|illegal/i.test(t) && tid === active) active = null;
  }
  return sc;
}
module.exports = { secondChance };
