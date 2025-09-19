// אלגוריתם כוחות: חלוקה שווה + ממוצעים שווים ככל הניתן + אילוצי חייב/לא-עם

export const sum = (a) => a.reduce((s, x) => s + Number(x || 0), 0);
export const avg = (a) => (a.length ? sum(a) / a.length : 0);

export function computeSizes(n, k) {
  // דוג': 23 ל-4 ⇒ [6,6,6,5] ; 26 ל-5 ⇒ [6,5,5,5,5] אבל נבנה “כמה שיותר שווה”
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

function violatesAvoid(team, p) {
  return team.some(
    (x) =>
      (x.avoid && x.avoid.includes(p.name)) ||
      (p.avoid && p.avoid.includes(x.name))
  );
}
function preferSatisfied(team, p) {
  if (!p.prefer || p.prefer.length === 0) return true;
  return team.some((x) => p.prefer.includes(x.name));
}
function validTeam(team) {
  // “לא עם” סימטרי, “חייב עם” נבדק ביחס לרשימת הקבוצה
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

  // ממוצע גלובלי – ישמש יעד לכל קבוצה (דרך סכום יעד לכל גודל)
  const globalMean = avg(pool.map((p) => p.rating));

  // גרידי: שחקנים בדירוג יורד
  const sorted = [...pool].sort(
    (a, b) => Number(b.rating || 0) - Number(a.rating || 0)
  );

  for (const p of sorted) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < k; i++) {
      const t = teams[i];
      if (t.length >= sizes[i]) continue; // אין מקום
      if (violatesAvoid(t, p)) continue;  // אסור “לא עם”
      // ניקוד: כמה קרובים לסכום יעד לאחר הוספת p
      const wantSum = globalMean * (t.length + 1);
      const newSum = sum(t.map((x) => x.rating)) + p.rating;
      let score = Math.abs(newSum - wantSum);

      // “חייב עם” – בונוס משמעותי אם הקבוצה מכילה אחד החייבים
      if (p.prefer && p.prefer.length && !preferSatisfied(t, p)) score += 5;

      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    // אם שום קבוצה לא עברה את המסננים, בחר את החוקית הקרובה ביותר ליעד, מבלי “לא עם”
    if (best < 0) {
      for (let i = 0; i < k; i++) {
        const t = teams[i];
        if (t.length >= sizes[i]) continue;
        const wantSum = globalMean * (t.length + 1);
        const newSum = sum(t.map((x) => x.rating)) + p.rating;
        const score = Math.abs(newSum - wantSum);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
    }
    if (best < 0) best = teams.findIndex((t, i) => t.length < sizes[i]); // נפילה רכה
    if (best < 0) best = 0;

    teams[best].push(p);
  }

  // שלב עדינות: החמרת “חייב עם” אם לא התקיים ע"י חילופים מקומיים
  const objective = (T) => {
    const means = T.map((t) => avg(t.map((p) => p.rating)));
    const spread = Math.max(...means) - Math.min(...means);
    const prefPenalty = T.reduce((acc, t) => {
      for (const p of t) {
        if (p.prefer && p.prefer.length && !preferSatisfied(t, p)) acc += 1;
      }
      return acc;
    }, 0);
    return spread * 100 + prefPenalty * 50;
  };

  let bestT = teams.map((t) => [...t]);
  let bestObj = objective(bestT);
  let stale = 0;

  while (stale < 600) {
    let improved = false;

    // החלפה בין שתי קבוצות
    for (let a = 0; a < k && !improved; a++) {
      for (let b = a + 1; b < k && !improved; b++) {
        for (const pa of bestT[a]) {
          for (const pb of bestT[b]) {
            const A = bestT[a].filter((x) => x !== pa).concat(pb);
            const B = bestT[b].filter((x) => x !== pb).concat(pa);
            if (A.length !== bestT[a].length || B.length !== bestT[b].length)
              continue;
            if (!validTeam(A) || !validTeam(B)) continue;
            const cand = bestT.map((t, i) =>
              i === a ? A : i === b ? B : t
            );
            const obj = objective(cand);
            if (obj + 1e-9 < bestObj) {
              bestT = cand;
              bestObj = obj;
              improved = true;
              break;
            }
          }
        }
      }
    }

    stale = improved ? 0 : stale + 1;
  }

  // סידור לפי ציון יורד
  return bestT.map((t) =>
    [...t].sort((x, y) => Number(y.rating || 0) - Number(x.rating || 0))
  );
}
