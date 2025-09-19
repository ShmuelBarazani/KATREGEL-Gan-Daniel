// אלגוריתם איזון קבוצות עם התחשבות ב"חייב עם" / "לא עם"
// ומטרה: ממוצעים כמה שיותר שווים + חלוקת גדלים שווה ככל האפשר.
// בכל קריאה יש רנדומליות קלה כדי לקבל קומבינציות שונות בלחיצה חוזרת.

export const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

// עוזר: הפניה לשחקן -> מזהה השחקן (תומך בשם/מזהה/אובייקט)
function refToId(ref, byName, byId) {
  if (ref == null) return null;
  if (typeof ref === "number") return ref;
  if (typeof ref === "string") {
    if (/^\d+$/.test(ref)) return Number(ref);
    const f = byName.get(ref.trim());
    return f ? f.id : null;
  }
  if (typeof ref === "object") {
    if (ref.id != null) return ref.id;
    if (ref.name && byName.has(ref.name)) return byName.get(ref.name).id;
  }
  return null;
}

// יצירת קבוצות "חייב עם" (clusters)
function buildPreferClusters(players, sel) {
  // מיפויים
  const byId = new Map(players.map((p) => [Number(p.id), p]));
  const byName = new Map(players.map((p) => [p.name, p]));

  // גרף שכנות לפי prefer
  const adj = new Map();
  for (const p of sel) {
    adj.set(Number(p.id), new Set());
  }
  for (const p of sel) {
    const from = Number(p.id);
    const list = Array.isArray(p.prefer) ? p.prefer : [];
    for (const ref of list) {
      const to = refToId(ref, byName, byId);
      if (to != null && adj.has(to)) {
        adj.get(from).add(Number(to));
        adj.get(Number(to)).add(from);
      }
    }
  }

  // בניית רכיבי קשירות (BFS) -> קלסטרים
  const seen = new Set();
  const clusters = [];
  for (const p of sel) {
    const start = Number(p.id);
    if (seen.has(start)) continue;
    const q = [start];
    const comp = [];
    seen.add(start);
    while (q.length) {
      const v = q.shift();
      comp.push(byId.get(v));
      for (const w of adj.get(v) || []) {
        if (!seen.has(w)) {
          seen.add(w);
          q.push(w);
        }
      }
    }
    clusters.push(comp);
  }

  return clusters;
}

// בדיקת אילוץ "לא עם"
function violatesAvoid(team, cluster, avoidMap) {
  for (const a of team) {
    const aAvoid = avoidMap.get(Number(a.id)) || new Set();
    for (const b of cluster) {
      if (aAvoid.has(Number(b.id))) return true;
    }
  }
  for (const b of cluster) {
    const bAvoid = avoidMap.get(Number(b.id)) || new Set();
    for (const a of team) {
      if (bAvoid.has(Number(a.id))) return true;
    }
  }
  return false;
}

// קביעת גדלי קבוצות שווים ככל האפשר
function teamSizes(n, k) {
  const base = Math.floor(n / k);
  const rem = n % k; // rem קבוצות יקבלו עוד שחקן אחד
  const sizes = Array.from({ length: k }, (_, i) => base + (i < rem ? 1 : 0));
  return sizes;
}

export function buildBalancedTeams(players, k) {
  const selected = players.filter((p) => p.selected);
  const n = selected.length;
  if (n === 0 || k < 2) return Array.from({ length: k }, () => []);

  const byId = new Map(selected.map((p) => [Number(p.id), p]));
  const byName = new Map(selected.map((p) => [p.name, p]));

  // הכנת avoidMap לפי מזהים
  const avoidMap = new Map(); // id -> Set(ids)
  for (const p of selected) {
    const set = new Set();
    const list = Array.isArray(p.avoid) ? p.avoid : [];
    for (const ref of list) {
      const id = refToId(ref, byName, byId);
      if (id != null && byId.has(Number(id))) set.add(Number(id));
    }
    avoidMap.set(Number(p.id), set);
  }

  // בניית קלסטרים של "חייב עם"
  let clusters = buildPreferClusters(players, selected);

  // ניקוד קלסטרים: סכום ציונים + מעט רנדומליות לשבירת תיקו
  clusters = clusters
    .map((c) => ({
      members: c,
      sum: c.reduce((s, p) => s + Number(p.rating || 0), 0),
    }))
    .sort((a, b) => b.sum - a.sum || Math.random() - 0.5);

  // גדלי קבוצות מטרה
  const targetSizes = teamSizes(n, k);

  // מטרה לסכום ציונים לקבוצה: להשוות סכום כולל / k
  const totalRating = selected.reduce((s, p) => s + Number(p.rating || 0), 0);
  const targetSum = totalRating / k;

  // אתחול קבוצות
  const teams = Array.from({ length: k }, () => []);
  const teamSums = Array.from({ length: k }, () => 0);

  // הכנסת קלסטרים אחד-אחד לתוך הקבוצה "הטובה ביותר"
  for (const cl of clusters) {
    const members = cl.members;
    const size = members.length;
    // אפשר רק לקבוצות שיש להן מקום לקלסטר כולו ושאין קונפליקט avoid
    const candidates = [];
    for (let i = 0; i < k; i++) {
      if (teams[i].length + size > targetSizes[i]) continue;
      if (violatesAvoid(teams[i], members, avoidMap)) continue;
      // עלות: כמה מתרחק מהמטרה
      const newSum = teamSums[i] + cl.sum;
      const cost = Math.abs(newSum - targetSum);
      candidates.push({ i, cost });
    }
    // אם אין קנדידטים (בגלל אילוצים) – נתיר חריגה זמנית: נחפש קבוצה בלי קונפליקט avoid עם מקום חלקי
    if (!candidates.length) {
      for (let i = 0; i < k; i++) {
        if (!violatesAvoid(teams[i], members, avoidMap)) {
          const newSum = teamSums[i] + cl.sum;
          const cost = Math.abs(newSum - targetSum) + 1000; // ענישה כדי להימנע ככל האפשר
          candidates.push({ i, cost });
        }
      }
    }
    // בחר את המועמד עם העלות הנמוכה ביותר, שבירת תיקו רנדומלית
    candidates.sort((a, b) => a.cost - b.cost || Math.random() - 0.5);
    const pick = candidates[0] ? candidates[0].i : 0;

    teams[pick].push(...members);
    teamSums[pick] += cl.sum;
  }

  // לוודא סידור לפי ציון יורד
  for (let i = 0; i < k; i++) {
    teams[i].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  }

  return teams;
}
