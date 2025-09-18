// src/App.jsx
import { useEffect, useMemo, useState } from "react";

/** -------------------------------------------------
 *  App.jsx — my-teams-app (RTL, עברית)
 *  ללא תלות חיצונית. שמירה ב-localStorage.
 *  טאבים: שחקנים / כוחות / דירוג
 *  ------------------------------------------------- */

const LS_KEY = "myTeamsApp_v1";

function usePersistedState(defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  return [state, setState];
}

export default function App() {
  const [data, setData] = usePersistedState({
    players: [], // {id,name,role,rating}
    sessions: [], // שמור מחזורים/כוחות בעתיד אם תרצה
  });

  const [tab, setTab] = useState("players");

  // טופס הוספת שחקן
  const [name, setName] = useState("");
  const [role, setRole] = useState("GK");
  const [rating, setRating] = useState("");

  // מצב כוחות
  const [teams, setTeams] = useState([]); // [ [playerIds...], [playerIds...] , ... ]
  const playersById = useMemo(() => {
    const map = new Map();
    data.players.forEach((p) => map.set(p.id, p));
    return map;
  }, [data.players]);

  // דירוג (לפי ציון, ניתן לשנות לוגיקה בקלות)
  const ranking = useMemo(() => {
    return [...data.players]
      .map((p) => ({ name: p.name, points: Math.round(Number(p.rating) * 10) }))
      .sort((a, b) => b.points - a.points);
  }, [data.players]);

  // עזר ליצירת מזהה
  const newId = () =>
    Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);

  /** ----------------- פעולות על שחקנים ----------------- */
  const addPlayer = () => {
    if (!name.trim() || !rating) {
      alert("מלא שם וציון");
      return;
    }
    const exists = data.players.some(
      (p) => p.name.trim() === name.trim() && p.role === role
    );
    if (exists && !confirm("השם כבר קיים בתפקיד הזה. להוסיף בכל זאת?")) return;

    const player = {
      id: newId(),
      name: name.trim(),
      role,
      rating: Number(rating),
    };
    setData((prev) => ({ ...prev, players: [...prev.players, player] }));
    setName("");
    setRating("");
  };

  const removePlayer = (id) => {
    if (!confirm("למחוק את השחקן?")) return;
    setData((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== id),
    }));
    // נקה הופעות שלו בכוחות הנוכחיים
    setTeams((t) => t.map((arr) => arr.filter((pid) => pid !== id)));
  };

  const updatePlayer = (id, fields) => {
    setData((prev) => ({
      ...prev,
      players: prev.players.map((p) => (p.id === id ? { ...p, ...fields } : p)),
    }));
  };

  /** ----------------- בניית כוחות מאוזנים -----------------
   * אלגוריתם "נחש": ממיינים מהגבוה לנמוך ומחלקים לסירוגין.
   * ניתן לשנות ל-N קבוצות (ברירת מחדל 2).
   * ------------------------------------------------------ */
  const makeTeams = (numTeams = 2) => {
    if (data.players.length < numTeams) {
      alert(`צריך לפחות ${numTeams} שחקנים`);
      return;
    }
    const sorted = [...data.players].sort(
      (a, b) => Number(b.rating) - Number(a.rating)
    );
    const out = Array.from({ length: numTeams }, () => []);
    let dir = 1;
    let idx = 0;
    for (const p of sorted) {
      out[idx].push(p.id);
      idx += dir;
      if (idx === numTeams) {
        idx = numTeams - 1;
        dir = -1;
      } else if (idx < 0) {
        idx = 0;
        dir = 1;
      }
    }
    setTeams(out);
    setTab("teams");
  };

  const clearTeams = () => setTeams([]);

  /** ----------------- רכיבים קטנים לשימוש פנימי ----------------- */
  const Field = ({ label, children }) => (
    <label style={{ display: "grid", gap: 6 }}>
      <span className="muted" style={{ paddingInlineStart: 2 }}>
        {label}
      </span>
      {children}
    </label>
  );

  const Card = ({ title, children, actions }) => (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      {title ? <h3 style={{ margin: 0 }}>{title}</h3> : null}
      {children}
      {actions}
    </div>
  );

  /** ----------------- מסכים ----------------- */
  const PlayersTab = () => (
    <div className="grid">
      <Card title="הוספת שחקן">
        <div className="row">
          <Field label="שם שחקן">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="שם שחקן"
            />
          </Field>
          <Field label="תפקיד">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="GK">שוער</option>
              <option value="DF">הגנה</option>
              <option value="MF">קישור</option>
              <option value="FW">התקפה</option>
            </select>
          </Field>
          <Field label="ציון (1–10, כולל חצאים)">
            <select
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              style={{ minWidth: 120 }}
            >
              <option value="" disabled>
                בחר ציון
              </option>
              {[
                5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
              ].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <button onClick={addPlayer}>הוסף</button>
        </div>
      </Card>

      <Card title="רשימת שחקנים">
        {data.players.length === 0 ? (
          <p className="muted">אין שחקנים עדיין. הוסף שחקנים מצד ימין.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {[...data.players]
              .sort((a, b) => a.name.localeCompare(b.name, "he"))
              .map((p) => (
                <div
                  key={p.id}
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    border: "1px solid var(--edge)",
                    borderRadius: 12,
                    padding: 10,
                  }}
                >
                  <div className="row" style={{ gap: 12 }}>
                    <strong>{p.name}</strong>
                    <span className="muted">· {roleName(p.role)}</span>
                    <span className="muted">· ציון: {p.rating}</span>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <select
                      value={p.role}
                      onChange={(e) => updatePlayer(p.id, { role: e.target.value })}
                    >
                      <option value="GK">שוער</option>
                      <option value="DF">הגנה</option>
                      <option value="MF">קישור</option>
                      <option value="FW">התקפה</option>
                    </select>
                    <select
                      value={p.rating}
                      onChange={(e) => updatePlayer(p.id, { rating: Number(e.target.value) })}
                    >
                      {[5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => removePlayer(p.id)}>מחק</button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );

  const TeamsTab = () => (
    <div className="grid">
      <Card title="ניהול כוחות">
        <div className="row">
          <button onClick={() => makeTeams(2)}>בנה 2 כוחות</button>
          <button onClick={() => makeTeams(3)}>בנה 3 כוחות</button>
          <button onClick={() => makeTeams(4)}>בנה 4 כוחות</button>
          <button onClick={clearTeams}>נקה</button>
        </div>
        <p className="muted">
          האלגוריתם מחלק את השחקנים לפי ציון כדי לאזן (גבוהים ונמוכים לסירוגין).
        </p>
      </Card>

      {teams.length === 0 ? (
        <Card>
          <p className="muted">עדיין אין כוחות. לחץ “בנה כוחות”.</p>
        </Card>
      ) : (
        teams.map((team, i) => {
          const teamPlayers = team.map((id) => playersById.get(id)).filter(Boolean);
          const avg =
            teamPlayers.length === 0
              ? 0
              : (
                  teamPlayers.reduce((s, p) => s + Number(p.rating), 0) /
                  teamPlayers.length
                ).toFixed(2);
          return (
            <Card key={i} title={`קבוצה ${i + 1} · ממוצע ${avg}`}>
              <div style={{ display: "grid", gap: 6 }}>
                {teamPlayers.map((p) => (
                  <div key={p.id} className="row" style={{ gap: 10 }}>
                    <span>• {p.name}</span>
                    <span className="muted">({roleName(p.role)} · {p.rating})</span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );

  const RankingTab = () => (
    <div className="grid">
      <Card title="דירוג שחקנים (לפי ציון)">
        {ranking.length === 0 ? (
          <p className="muted">אין שחקנים – הוסף שחקנים בלשונית "שחקנים".</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {ranking.map((r, idx) => (
              <div
                key={r.name + idx}
                className="row"
                style={{
                  justifyContent: "space-between",
                  border: "1px solid var(--edge)",
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <div className="row" style={{ gap: 12 }}>
                  <strong>#{idx + 1} {r.name}</strong>
                </div>
                <div className="muted">{r.points} נק׳</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div className="page">
      <h1 style={{ marginBottom: 6 }}>my-teams-app</h1>
      <div className="muted">גרסה בסיסית — Vite + React · RTL</div>

      {/* ניווט טאבים */}
      <div className="nav" style={{ marginTop: 14, marginBottom: 12 }}>
        <button
          className={`tab-btn ${tab === "players" ? "active" : ""}`}
          onClick={() => setTab("players")}
        >
          שחקנים
        </button>
        <button
          className={`tab-btn ${tab === "teams" ? "active" : ""}`}
          onClick={() => setTab("teams")}
        >
          כוחות
        </button>
        <button
          className={`tab-btn ${tab === "ranking" ? "active" : ""}`}
          onClick={() => setTab("ranking")}
        >
          דירוג
        </button>
      </div>

      {/* תוכן */}
      {tab === "players" && <PlayersTab />}
      {tab === "teams" && <TeamsTab />}
      {tab === "ranking" && <RankingTab />}

      <div className="muted" style={{ marginTop: 16, fontSize: 13 }}>
        שמירה מתבצעת אוטומטית בדפדפן (localStorage). ניתן לרוקן את השמירה ע״י ניקוי נתוני אתר.
      </div>
    </div>
  );
}

/** שמות תפקידים בעברית */
function roleName(code) {
  switch (code) {
    case "GK":
      return "שוער";
    case "DF":
      return "הגנה";
    case "MF":
      return "קישור";
    case "FW":
      return "התקפה";
    default:
      return code || "";
  }
}
