/* 
  balance.js
  אלגוריתם בניית קבוצות מאוזנות:
  - חלוקת שחקנים שסומנו למשחק ל-k קבוצות בגודל הכי שווה שניתן.
  - "חייב עם": מאחד שחקנים לקבוצות-על (Union-Find).
  - "לא עם": איסור קשיח לשיבוץ יחד בקבוצה.
  - אופטימיזציה: הקטנת שונות הממוצעים בין הקבוצות.
  - ריצות מרובות = "עשה כוחות" שונה בכל לחיצה.
*/

function dsuMakeSet(x, parent) { if (!parent.has(x)) parent.set(x, x); }
function dsuFind(x, parent) {
  while (parent.get(x) !== x) {
    parent.set(x, parent.get(parent.get(x)));
    x = parent.get(x);
  }
  return x;
}
function dsuUnion(a, b, parent) {
  const ra = dsuFind(a, parent);
  const rb = dsuFind(b, parent);
  if (ra !== rb) parent.set(ra, rb);
}

function distributeCapacities(n, k) {
  const base = Math.floor(n / k);
  const r = n % k;
  const cap = Array.from({ length: k }, (_, i) => base + (i < r ? 1 : 0));
  return cap;
}

function varianceAvgs(teams) {
  const avgs = teams.map(t => t.players.length ? t.sum / t.players.length : 0);
  const mean = avgs.reduce((s, x) => s + x, 0) / Math.max(1, avgs.length);
  return avgs.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / Math.max(1, avgs.length);
}

function canPlaceGroup(team, group, notWithMap, teamSet) {
  // איסור קשיח על "לא עם": אף אחד מהקבוצה לא יכול להיות באותה קבוצה עם מי שמסומן לו notWith
  for (const pid of group.ids) {
    const banned = notWithMap.get(pid);
    if (!banned) continue;
    for (const x of banned) {
      if (teamSet.has(x)) return false;
    }
  }
  return true;
}

function applyGroupToTeam(team, group, teamSet) {
  for (const p of group.members) {
    team.players.push(p);
    team.sum += p.rating;
    teamSet.add(p.id);
  }
}

function removeGroupFromTeam(team, group, teamSet) {
  const ids = new Set(group.ids);
  team.players = team.players.filter(p => {
    const keep = !ids.has(p.id);
    if (!keep) team.sum -= p.rating;
    return keep;
  });
  for (const id of ids) teamSet.delete(id);
}

function cloneTeams(teams) {
  return teams.map(t => ({
    players: [...t.players],
    sum: t.sum
  }));
}

// שיפור לוקאלי: ניסיון להחליף/להעביר קבוצות-על בין קבוצות לצמצום שונות הממוצעים
function localImprove(teams, groupById, notWithMap, teamSets, caps, maxSteps = 1200) {
  // בונה מיפוי קבוצה-על -> באיזו קבוצה היא כרגע
  const groupIdByPlayer = new Map();
  for (const [gid, g] of groupById) {
    for (const p of g.members) groupIdByPlayer.set(p.id, gid);
  }

  const teamOfGroup = new Map();
  for (let ti = 0; ti < teams.length; ti++) {
    for (const p of teams[ti].players) {
      const gid = groupIdByPlayer.get(p.id);
      teamOfGroup.set(gid, ti);
    }
  }

  const groups = [...groupById.values()];
  let bestVar = varianceAvgs(teams);

  for (let step = 0; step < maxSteps; step++) {
    const g = groups[Math.floor(Math.random() * groups.length)];
    const from = teamOfGroup.get(g.id);

    // נסה להעביר לקבוצה אחרת או לבצע swap עם קבוצה-על אחרת
    for (let to = 0; to < teams.length; to++) {
      if (to === from) continue;
      // בדוק capacity
      const fromSize = teams[from].players.length;
      const toSize = teams[to].players.length;
      const canMove = toSize + g.size <= caps[to] && (fromSize - g.size) >= 0;

      if (canMove && canPlaceGroup(teams[to], g, notWithMap, teamSets[to])) {
        // נסה מעבר ישיר
        removeGroupFromTeam(teams[from], g, teamSets[from]);
        applyGroupToTeam(teams[to], g, teamSets[to]);

        const v = varianceAvgs(teams);
        if (v < bestVar) {
          bestVar = v;
          teamOfGroup.set(g.id, to);
          break;
        } else {
          // החזר
          removeGroupFromTeam(teams[to], g, teamSets[to]);
          applyGroupToTeam(teams[from], g, teamSets[from]);
        }
      } else {
        // נסה SWAP עם קבוצה-על אחרת
        for (const [gid2, g2] of groupById) {
          if (gid2 === g.id) continue;
          const otherTeam = teamOfGroup.get(gid2);
          if (otherTeam !== to) continue;
          // בדוק capacity לאחר SWAP
          const fromNew = teams[from].players.length - g.size + g2.size;
          const toNew = teams[to].players.length - g2.size + g.size;
          if (fromNew <= caps[from] && toNew <= caps[to]) {
            // בדוק מגבלות notWith
            if (
              canPlaceGroup(teams[to], g, notWithMap, teamSets[to]) &&
              canPlaceGroup(teams[from], g2, notWithMap, teamSets[from])
            ) {
              // החלף
              removeGroupFromTeam(teams[from], g, teamSets[from]);
              removeGroupFromTeam(teams[to], g2, teamSets[to]);
              applyGroupToTeam(teams[from], g2, teamSets[from]);
              applyGroupToTeam(teams[to], g, teamSets[to]);

              const v = varianceAvgs(teams);
              if (v < bestVar) {
                bestVar = v;
                teamOfGroup.set(g.id, to);
                teamOfGroup.set(g2.id, from);
                break;
              } else {
                // החזר
                removeGroupFromTeam(teams[from], g2, teamSets[from]);
                removeGroupFromTeam(teams[to], g, teamSets[to]);
                applyGroupToTeam(teams[from], g, teamSets[from]);
                applyGroupToTeam(teams[to], g2, teamSets[to]);
              }
            }
          }
        }
      }
    }
  }
}

export function balanceTeams(players, k, { runs = 12 } = {}) {
  // קח רק שחקנים שסומנו לשחק
  const pool = players.filter(p => p.playing);

  // capacities
  const caps = distributeCapacities(pool.length, k);

  // בנה Union-Find ל"חייב עם"
  const parent = new Map();
  for (const p of pool) dsuMakeSet(p.id, parent);
  for (const p of pool) {
    if (Array.isArray(p.mustWith)) {
      for (const q of p.mustWith) {
        if (pool.find(x => x.id === q)) dsuUnion(p.id, q, parent);
      }
    }
  }

  // בנה קבוצות-על
  const groupsByRoot = new Map();
  for (const p of pool) {
    const r = dsuFind(p.id, parent);
    if (!groupsByRoot.has(r)) groupsByRoot.set(r, []);
    groupsByRoot.get(r).push(p);
  }
  let gidInc = 1;
  const groups = [];
  const groupById = new Map();
  for (const [root, members] of groupsByRoot) {
    const g = {
      id: gidInc++,
      ids: members.map(m => m.id),
      members,
      size: members.length,
      sum: members.reduce((s, m) => s + m.rating, 0),
      avg: members.reduce((s, m) => s + m.rating, 0) / members.length
    };
    groups.push(g);
    groupById.set(g.id, g);
  }

  // "לא עם" לכל שחקן -> Set
  const notWithMap = new Map();
  for (const p of pool) {
    notWithMap.set(p.id, new Set(Array.isArray(p.notWith) ? p.notWith : []));
  }

  // סדר קבוצות-על: מהממוצע הגבוה לנמוך (יותר יציב לזרוק חזקות קודם)
  groups.sort((a, b) => b.avg - a.avg);

  // ריצות מרובות לבחור את הטוב ביותר (שונות ממוצעים מינימלית)
  let best = null;
  let bestVar = Infinity;

  for (let run = 0; run < Math.max(1, runs); run++) {
    // ערבוב קל לשונות
    const shuffled = [...groups].sort(() => Math.random() - 0.5);

    const teams = Array.from({ length: k }, () => ({ players: [], sum: 0 }));
    const teamSets = Array.from({ length: k }, () => new Set());

    // שיבוץ גרידי: כל פעם לקבוצה עם ממוצע נמוך ביותר שיכולה לקלוט את הקבוצה-על בכפוף ל-capacity ו-"לא עם"
    for (const g of shuffled) {
      let bestIdx = -1;
      let bestScore = Infinity;

      for (let ti = 0; ti < k; ti++) {
        const t = teams[ti];
        if (t.players.length + g.size > caps[ti]) continue;
        if (!canPlaceGroup(t, g, notWithMap, teamSets[ti])) continue;

        // score = ממוצע חדש של הקבוצה (כמה יקרב לאיזון – יעד = ממוצע כללי)
        const newAvg = (t.sum + g.sum) / (t.players.length + g.size);
        // יעד: הממוצע הכללי
        const globalAvg = pool.reduce((s, p) => s + p.rating, 0) / Math.max(1, pool.length);
        const score = Math.abs(newAvg - globalAvg);

        if (score < bestScore) {
          bestScore = score;
          bestIdx = ti;
        }
      }

      if (bestIdx === -1) {
        // לא נמצא חוקי -> נכשל בריצה הזו
        // כדי לא “לשבור” את הקשיחות של "לא עם", פשוט נפסול את הריצה הזו
        // (בפרקטיקה, בגלל הריצות המרובות, אחת מהריצות תצליח)
        bestIdx = 0; // תאחסן למניעת קריסה
        return balanceTeams(players, k, { runs: runs + 1 }); // נסה שוב עם עוד ריצות
      }

      applyGroupToTeam(teams[bestIdx], g, teamSets[bestIdx]);
    }

    // שיפור לוקאלי מצמצם שונות
    localImprove(teams, groupById, notWithMap, teamSets, caps, 1200);

    const v = varianceAvgs(teams);
    if (v < bestVar) {
      bestVar = v;
      best = teams;
    }
  }

  // החזר במבנה נוח: רשימת קבוצות + ממוצע
  return best.map((t, i) => ({
    id: i + 1,
    players: t.players,
    avg: t.players.length ? (t.sum / t.players.length) : 0
  }));
}
