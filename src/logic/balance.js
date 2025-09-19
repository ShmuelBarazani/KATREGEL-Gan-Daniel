// src/logic/balance.js
export const sum = (a) => a.reduce((s, x) => s + Number(x || 0), 0);
export const avg = (a) => (a.length ? sum(a.map(Number)) / a.length : 0);

export function computeSizes(n, k) {
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

// בדיקות אילוצים – תומך ב-id או name
function listIncludesRef(list, player) {
  if (!Array.isArray(list)) return false;
  return list.some((v) =>
    typeof v === "number"
      ? v === player.id
      : typeof v === "string"
      ? v === player.name
      : v?.id
      ? v.id === player.id
      : v?.name
      ? v.name === player.name
      : false
  );
}
function violatesAvoid(team, p) {
  return team.some((x) => listIncludesRef(x.avoid, p) || listIncludesRef(p.avoid, x));
}
function preferSatisfied(team, p) {
  if (!p.prefer || p.prefer.length === 0) return true;
  return team.some((x) => listIncludesRef(p.prefer, x));
}
function validTeam(team) {
  for (let i = 0; i < team.length; i++) {
    const p = team[i];
    const rest = team.filter((_, j) => j !== i);
    if (violatesAvoid(rest, p)) return false;
  }
  return true;
}

export function buildBalancedTeams(allPlayers, k) {
  const pool = allPlayers.filter((p) => p.selected);
  const sizes = computeSizes(pool.length, k);
  const teams = Array.from({ length: k }, () => []);
  if (!pool.length) return teams;

  const globalMean = avg(pool.map((p) => p.rating));

  // דירוג יורד
  const sorted = [...pool].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));

  for (const p of sorted) {
    let best = -1;
    let bestScore = Infinity;

    for (let i = 0; i < k; i++) {
      const t = teams[i];
      if (t.length >= sizes[i]) continue;
      if (violatesAvoid(t, p)) continue;

      const wantSum = globalMean * (t.length + 1);
      const newSum = sum(t.map((x) => x.rating)) + Number(p.rating || 0);
      let score = Math.abs(newSum - wantSum);

      if (p.prefer && p.prefer.length && !preferSatisfied(t, p)) score += 5;

      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }

    if (best < 0) {
      for (let i = 0; i < k; i++) {
        const t = teams[i];
        if (t.length >= sizes[i]) continue;
        const wantSum = globalMean * (t.length + 1);
        const newSum = sum(t.map((x) => x.rating)) + Number(p.rating || 0);
        const score = Math.abs(newSum - wantSum);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
    if (best < 0) best = teams.findIndex((t, i) => t.length < sizes[i]);
    if (best < 0) best = 0;
    teams[best].push(p);
  }

  // שיפור עדין – חילופים מקומיים לצמצום סטיית ממוצעים ולאכוף חייב-עם
  const objective = (T) => {
    const means = T.map((t) => avg(t.map((p) => p.rating)));
    const spread = Math.max(...means) - Math.min(...means);
    const prefPenalty = T.reduce((acc, t) => {
      for (const p of t) if (p.prefer && p.prefer.length && !preferSatisfied(t, p)) acc += 1;
      return acc;
    }, 0);
    return spread * 100 + prefPenalty * 50;
  };
  let bestT = teams.map((t) => t.slice());
  let bestObj = objective(bestT);
  let tries = 0;

  while (tries < 600) {
    let improved = false;
    outer: for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        for (const pa of bestT[a]) {
          for (const pb of bestT[b]) {
            const A = bestT[a].filter((x) => x !== pa).concat(pb);
            const B = bestT[b].filter((x) => x !== pb).concat(pa);
            if (!validTeam(A) || !validTeam(B)) continue;
            const cand = bestT.map((t, i) => (i === a ? A : i === b ? B : t));
            const obj = objective(cand);
            if (obj + 1e-9 < bestObj) {
              bestT = cand;
              bestObj = obj;
              improved = true;
              break outer;
            }
          }
        }
      }
    }
    if (!improved) tries++;
    else tries = 0;
  }

  return bestT.map((t) => t.sort((x, y) => Number(y.rating || 0) - Number(x.rating || 0)));
}
