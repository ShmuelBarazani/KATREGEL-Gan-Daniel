import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildBalancedTeams, avg } from "./logic/balance";

const LS_KEY = "katregel_state_v14";
const uid = () => Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
const POS = [
  ["GK", "שוער"],
  ["DF", "הגנה"],
  ["MF", "קישור"],
  ["FW", "התקפה"],
];
const RSTEPS = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5);
const MODE = new URLSearchParams(location.search).get("mode") === "viewer" ? "viewer" : "admin";

const roleName = (c) => ({ GK: "שוער", DF: "הגנה", MF: "קישור", FW: "התקפה" }[c] || c);
const normRole = (v) => {
  const t = (v || "").toString().trim().toLowerCase();
  if (["gk", "ש"].includes(t)) return "GK";
  if (["df", "ה", "בלם", "מגן", "הגנה"].includes(t)) return "DF";
  if (["mf", "ק", "קישור", "קשר"].includes(t)) return "MF";
  if (["fw", "ח", "חלוץ", "כנף", "התקפה"].includes(t)) return "FW";
  return ["GK", "DF", "MF", "FW"].includes(v) ? v : "MF";
};

// שם שחקן מכל רפרנס
function resolveRefToName(ref, players) {
  if (ref == null) return "";
  if (typeof ref === "number") {
    const f = players.find((pl) => Number(pl.id) === Number(ref));
    return f?.name || String(ref);
  }
  if (typeof ref === "string" && /^\d+$/.test(ref)) {
    const f = players.find((pl) => String(pl.id) === ref);
    return f?.name || ref;
  }
  if (typeof ref === "object") {
    if (ref.name) return ref.name;
    if (ref.id != null) {
      const f = players.find((pl) => String(pl.id) === String(ref.id));
      return f?.name || String(ref.id);
    }
  }
  return String(ref);
}

function useStore() {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : { players: [], sessions: [] };
    } catch {
      return { players: [], sessions: [] };
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
  const [store, setStore] = useStore();
  const [tab, setTab] = useState(MODE === "viewer" ? "ranking" : "teams");
  const [numTeams, setNumTeams] = useState(4);
  const [teams, setTeams] = useState([]);
  const [roundDraft, setRoundDraft] = useState(null);

  // טעינה ראשונית מקובץ players.json
  useEffect(() => {
    (async () => {
      if (store.players.length) return;
      try {
        const r = await fetch("/players.json", { cache: "no-store" });
        if (!r.ok) return;
        const raw = await r.json();
        if (!Array.isArray(raw) || !raw.length) return;

        const players = raw
          .map((p) => ({
            id: p.id ?? uid(),
            name: p.name ?? p.שם,
            role: normRole(p.role ?? p.pos ?? p.עמדה ?? p.תפקיד ?? "MF"),
            rating: Number(p.rating ?? p.r ?? p.ציון ?? 7),
            selected: p.selected ?? true,
            prefer: Array.isArray(p.prefer) ? p.prefer : [],
            avoid: Array.isArray(p.avoid) ? p.avoid : [],
          }))
          .filter((x) => x.name);

        setStore((s) => ({ ...s, players }));
      } catch {}
    })();
  }, []);

  const selected = useMemo(() => store.players.filter((p) => p.selected), [store.players]);
  const addPlayer = (p) => setStore((s) => ({ ...s, players: [...s.players, { id: uid(), ...p }] }));
  const updatePlayer = (id, patch) =>
    setStore((s) => ({ ...s, players: s.players.map((p) => (String(p.id) === String(id) ? { ...p, ...patch } : p)) }));
  const removePlayer = (id) =>
    setStore((s) => ({ ...s, players: s.players.filter((p) => String(p.id) !== String(id)) }));

  // יצירת כוחות – כל לחיצה תיתן חלוקה אחרת (randomized inside)
  const makeTeams = () => {
    const t = buildBalancedTeams(store.players, numTeams);
    setTeams(t);
    if (MODE !== "viewer") setTab("teams");
  };

  // קבע מחזור
  const lockRound = () => {
    if (!teams.length) return alert("קודם צריך לעשות כוחות");
    const snapshot = teams.map((g) => g.map((p) => ({ id: p.id, name: p.name, goals: 0 })));
    const draft = {
      id: uid(),
      date: new Date().toISOString(),
      teams: snapshot.map((list) => ({ wins: 0, draws: 0, losses: 0, players: list })),
    };
    setRoundDraft(draft);
    setTab("rounds");
  };

  return (
    <div className="page">
      <div className="appbar">
        <div className="title">⚽ קטרגל — גן-דניאל</div>
        <div className="tabs">
          {MODE !== "viewer" && (
            <>
              <button className={`tab ${tab === "teams" ? "active" : ""}`} onClick={() => setTab("teams")}>
                כוחות
              </button>
              <button className={`tab ${tab === "players" ? "active" : ""}`} onClick={() => setTab("players")}>
                שחקנים
              </button>
              <button className={`tab ${tab === "rounds" ? "active" : ""}`} onClick={() => setTab("rounds")}>
                ניהול מחזורים ותוצאות
              </button>
            </>
          )}
          <button className={`tab ${tab === "ranking" ? "active" : ""}`} onClick={() => setTab("ranking")}>
            דירוג
          </button>
        </div>
      </div>

      {tab === "teams" && MODE !== "viewer" && (
        <TeamsScreen
          players={store.players}
          update={updatePlayer}
          remove={removePlayer}
          add={addPlayer}
          numTeams={numTeams}
          setNumTeams={setNumTeams}
          makeTeams={makeTeams}
          teams={teams}
          setTeams={setTeams}
          onLockRound={lockRound}
          selectedCount={selected.length}
        />
      )}

      {tab === "players" && MODE !== "viewer" && (
        <PlayersScreen players={store.players} update={updatePlayer} remove={removePlayer} add={addPlayer} />
      )}

      {tab === "rounds" && MODE !== "viewer" && (
        <RoundsManager
          draft={roundDraft}
          setDraft={setRoundDraft}
          sessions={store.sessions}
          onSave={(draft) => {
            setStore((s) => ({ ...s, sessions: [...s.sessions, draft] }));
            setRoundDraft(null);
            setTab("ranking");
          }}
        />
      )}

      {tab === "ranking" && <RankingScreen sessions={store.sessions} />}
    </div>
  );
}

/* ---------------- כוחות ---------------- */
function TeamsScreen({
  players,
  update,
  remove,
  add,
  numTeams,
  setNumTeams,
  makeTeams,
  teams,
  setTeams,
  onLockRound,
  selectedCount,
}) {
  const [sortBy, setSort] = useState("name");
  const [dir, setDir] = useState("asc");
  const [hideRatings, setHideRatings] = useState(false);

  const sortedPlayers = useMemo(() => {
    const a = [...players];
    const cmp =
      {
        name: (x, y) => x.name.localeCompare(y.name, "he"),
        role: (x, y) => roleName(x.role).localeCompare(roleName(y.role), "he"),
        rating: (x, y) => x.rating - y.rating,
        selected: (x, y) => Number(x.selected) - Number(y.selected),
      }[sortBy] || (() => 0);
    a.sort(cmp);
    if (dir === "desc") a.reverse();
    return a;
  }, [players, sortBy, dir]);
  const onSort = (col) =>
    setSort((p) => {
      if (p === col) {
        setDir((d) => (d === "asc" ? "desc" : "asc"));
        return p;
      }
      setDir("asc");
      return col;
    });

  // Dragging
  const dragFromList = (e, pid) => {
    e.dataTransfer.setData("text/plain", String(pid));
    e.dataTransfer.effectAllowed = "move";
  };
  const allowDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add("over");
  };
  const leaveDrop = (e) => e.currentTarget.classList.remove("over");

  // הוספה לקבוצה
  const dropToTeam = (e, idx) => {
    e.preventDefault();
    e.currentTarget.classList.remove("over");
    const pid = Number(e.dataTransfer.getData("text/plain"));
    setTeams((prev) => {
      const next = prev.map((t) => [...t]);
      // הסר ממקומות אחרים (למנוע כפילויות)
      for (let i = 0; i < next.length; i++) {
        const j = next[i].findIndex((p) => Number(p.id) === Number(pid));
        if (j >= 0) next[i].splice(j, 1);
      }
      const pl = players.find((p) => Number(p.id) === Number(pid));
      if (pl && !next[idx].some((p) => Number(p.id) === Number(pid))) next[idx].push(pl);
      return next.map((t) => t.sort((a, b) => b.rating - a.rating));
    });
  };

  // גרירה לאזור טבלת השחקנים – מסיר מהקבוצות
  const dropToPlayers = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("over");
    const pid = Number(e.dataTransfer.getData("text/plain"));
    setTeams((prev) => prev.map((t) => t.filter((p) => Number(p.id) !== Number(pid))));
  };

  const [printOpen, setPrintOpen] = useState(false);
  const means = teams.map((t) => (t.length ? avg(t.map((p) => p.rating)) : 0));

  return (
    <div className="card">
      <div className="controls" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        <span className="badge">{numTeams}</span>
        <button className="btn" onClick={() => setNumTeams((n) => Math.max(2, n - 1))}>
          −
        </button>
        <button className="btn" onClick={() => setNumTeams((n) => Math.min(8, n + 1))}>
          +
        </button>

        <button className="btn primary" onClick={makeTeams}>
          עשה כוחות
        </button>

        <button className="btn" onClick={() => setHideRatings((v) => !v)}>
          {hideRatings ? "הצג ציונים" : "הסתר ציונים (בקבוצות)"}
        </button>

        <button className="btn" onClick={() => setPrintOpen(true)}>
          תצוגת הדפסה
        </button>
        <button className="btn" onClick={onLockRound}>
          קבע מחזור
        </button>

        <div style={{ marginInlineStart: "auto" }} className="muted">
          מסומנים: <strong>{selectedCount}</strong>
        </div>
      </div>

      {/* קבוצות – ללא גלילה, נעטוף לשתי שורות במקרה של 5+ קבוצות */}
      <div className="teamsTop noScroll">
        <div className={`teamsGrid ${hideRatings ? "hideRatings" : ""}`}>
          {teams.map((team, i) => (
            <div
              key={i}
              className="teamCard dropzone"
              onDragOver={allowDrop}
              onDragLeave={leaveDrop}
              onDrop={(e) => dropToTeam(e, i)}
            >
              <div className="teamHeader">
                <div className="name">קבוצה {i + 1}</div>
                <div className="meta">ממוצע {means[i].toFixed(2)}</div>
              </div>
              {team.map((p) => (
                <div key={p.id} className="player-line" draggable onDragStart={(e) => dragFromList(e, p.id)}>
                  <span>
                    <span className="handle">⋮⋮</span> {p.name}
                  </span>
                  {!hideRatings && (
                    <span className="subtle">
                      {roleName(p.role)} · {p.rating}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* רשימת השחקנים – דראג לכאן מסיר מהקבוצות */}
      <div className="playersBelow dropzone" onDragOver={allowDrop} onDragLeave={leaveDrop} onDrop={dropToPlayers}>
        <table className="table">
          <thead>
            <tr>
              <th className="th-sort" onClick={() => onSort("selected")}>
                משחק?
              </th>
              <th className="th-sort" onClick={() => onSort("name")}>
                שם
              </th>
              <th className="th-sort" onClick={() => onSort("role")}>
                עמדה
              </th>
              <th className="th-sort" onClick={() => onSort("rating")}>
                ציון
              </th>
              <th>חייב עם</th>
              <th>לא עם</th>
              <th>מחק</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayers.map((p) => (
              <tr key={p.id}>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!p.selected}
                    onChange={(e) => update(p.id, { selected: e.target.checked })}
                  />
                </td>
                <td>
                  <input className="mini" value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
                </td>
                <td>
                  <select className="mini" value={p.role} onChange={(e) => update(p.id, { role: e.target.value })}>
                    {POS.map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="mini"
                    value={p.rating}
                    onChange={(e) => update(p.id, { rating: Number(e.target.value) })}
                  >
                    {RSTEPS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="chips">
                    {(p.prefer || []).map((x, i) => (
                      <span key={i} className="chip">
                        {resolveRefToName(x, players)}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <div className="chips">
                    {(p.avoid || []).map((x, i) => (
                      <span key={i} className="chip hollow">
                        {resolveRefToName(x, players)}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <button className="btn danger" onClick={() => remove(p.id)}>
                    מחק
                  </button>
                </td>
                <td title="גרור לקבוצה">
                  <span className="handle" draggable onDragStart={(e) => dragFromList(e, p.id)}>
                    ⋮⋮
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {printOpen && <PrintPreview teams={teams} onClose={() => setPrintOpen(false)} />}
    </div>
  );
}

/* ---------- Preview הדפסה (Modal) ---------- */
function PrintPreview({ teams, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  // 2×2 בכל עמוד (נשתמש ב-page-break אחרי כל 4 קבוצות)
  const chunks = [];
  for (let i = 0; i < teams.length; i += 4) chunks.push(teams.slice(i, i + 4));

  return createPortal(
    <div className="modal printModal" onClick={onClose}>
      <div className="box printContent" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <button className="btn primary" onClick={() => window.print()}>
            יצוא PDF / הדפס
          </button>
          <button className="btn" onClick={onClose}>
            סגור
          </button>
        </div>

        {chunks.map((page, pi) => (
          <div key={pi} className="sheetGrid">
            {page.map((team, idx) => (
              <div key={idx} className="sheet">
                <div className="sheetHeader">
                  <div>תאריך: {today}</div>
                  <div>קבוצה {pi * 4 + idx + 1}</div>
                </div>
                <table className="sheetTable">
                  <thead>
                    <tr>
                      <th style={{ width: "65%" }}>שחקן</th>
                      <th>שערים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>
                          <div className="boxes">
                            {Array.from({ length: 8 }).map((_, i) => (
                              <div key={i} className="box" />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 10 }}>
                  {["ניצחון", "תיקו", "הפסד"].map((label) => (
                    <div key={label} className="boxRow">
                      <div className="boxRow-label">{label}</div>
                      <div className="boxes">
                        {Array.from({ length: 6 }).map((_, j) => (
                          <div key={j} className="box" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {/* הפרדת עמודים בהדפסה */}
            <div className="pageBreak" />
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}

/* ---------------- שחקנים ---------------- */
function PlayersScreen({ players, update, remove, add }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", role: "DF", rating: 7, selected: true });

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn primary" onClick={() => setShowAdd(true)}>
          הוסף שחקן
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>משחק?</th>
            <th>שם</th>
            <th>עמדה</th>
            <th>ציון</th>
            <th>חייב עם</th>
            <th>לא עם</th>
            <th>מחק</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td style={{ textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={!!p.selected}
                  onChange={(e) => update(p.id, { selected: e.target.checked })}
                />
              </td>
              <td>
                <input className="mini" value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} />
              </td>
              <td>
                <select className="mini" value={p.role} onChange={(e) => update(p.id, { role: e.target.value })}>
                  {POS.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  className="mini"
                  value={p.rating}
                  onChange={(e) => update(p.id, { rating: Number(e.target.value) })}
                >
                  {RSTEPS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <div className="chips">
                  {(p.prefer || []).map((x, i) => (
                    <span key={i} className="chip">
                      {resolveRefToName(x, players)}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <div className="chips">
                  {(p.avoid || []).map((x, i) => (
                    <span key={i} className="chip hollow">
                      {resolveRefToName(x, players)}
                    </span>
                  ))}
                </div>
              </td>
              <td>
                <button className="btn danger" onClick={() => remove(p.id)}>
                  מחק
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAdd && (
        <div className="modal" onClick={() => setShowAdd(false)}>
          <div className="box wide" onClick={(e) => e.stopPropagation()}>
            <h3>הוספת שחקן</h3>
            <div className="row">
              <input
                className="mini"
                placeholder="שם"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <select
                className="mini"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              >
                {POS.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                className="mini"
                value={form.rating}
                onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))}
              >
                {RSTEPS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={form.selected}
                  onChange={(e) => setForm((f) => ({ ...f, selected: e.target.checked }))}
                />{" "}
                משחק?
              </label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => setShowAdd(false)}>
                סגור
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  if (!form.name.trim()) return;
                  add(form);
                  setForm({ name: "", role: "DF", rating: 7, selected: true });
                  setShowAdd(false);
                }}
              >
                שמור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- ניהול מחזורים ותוצאות ---------------- */
function RoundsManager({ draft, setDraft, sessions, onSave }) {
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const current = useMemo(() => {
    if (draft) return draft;
    return sessions.find((x) => x.id === selectedSessionId) || null;
  }, [draft, sessions, selectedSessionId]);

  if (!current)
    return (
      <div className="card">
        <div className="section-title">ניהול מחזורים ותוצאות</div>
        <SavedSessionsList sessions={sessions} onPick={setSelectedSessionId} />
      </div>
    );

  const setCounts = (ti, patch) =>
    setDraft((d) => ({
      ...(d || current),
      teams: (d || current).teams.map((t, i) => (i === ti ? { ...t, ...patch } : t)),
    }));

  const setGoal = (ti, pid, val) =>
    setDraft((d) => ({
      ...(d || current),
      teams: (d || current).teams.map((t, i) =>
        i !== ti
          ? t
          : {
              ...t,
              players: t.players.map((p) =>
                p.id === pid ? { ...p, goals: Math.max(0, parseInt(val || "0", 10) || 0) } : p
              ),
            }
      ),
    }));

  const save = () => onSave(draft || current);
  const allPlayers = current.teams.flatMap((t) => t.players);

  return (
    <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
      <div className="card" style={{ flex: 1 }}>
        <div className="section-title">תוצאות המחזור — {new Date(current.date).toLocaleDateString()}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
          {current.teams.map((t, ti) => (
            <div key={ti} className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <strong>קבוצה {ti + 1}</strong>
                <div className="row">
                  <label>
                    נצ׳:{" "}
                    <input
                      className="mini"
                      type="number"
                      min="0"
                      value={t.wins ?? 0}
                      onChange={(e) => setCounts(ti, { wins: +e.target.value })}
                    />
                  </label>
                  <label>
                    תיקו:{" "}
                    <input
                      className="mini"
                      type="number"
                      min="0"
                      value={t.draws ?? 0}
                      onChange={(e) => setCounts(ti, { draws: +e.target.value })}
                    />
                  </label>
                  <label>
                    הפס׳:{" "}
                    <input
                      className="mini"
                      type="number"
                      min="0"
                      value={t.losses ?? 0}
                      onChange={(e) => setCounts(ti, { losses: +e.target.value })}
                    />
                  </label>
                </div>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>שם</th>
                    <th style={{ width: 120 }}>שערים</th>
                  </tr>
                </thead>
                <tbody>
                  {t.players.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>
                        <input
                          className="mini"
                          type="number"
                          min="0"
                          value={p.goals || 0}
                          onChange={(e) => setGoal(ti, p.id, e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={save}>
            שמור מחזור
          </button>
        </div>
      </div>

      <div className="card" style={{ flex: 1 }}>
        <div className="section-title">שערים למחזור</div>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>שם</th>
              <th style={{ width: 120 }}>שערים</th>
            </tr>
          </thead>
          <tbody>
            {allPlayers.map((p, idx) => (
              <tr key={`${p.id}-${idx}`}>
                <td>{idx + 1}</td>
                <td>{p.name}</td>
                <td>{p.goals || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ width: 340 }}>
        <div className="section-title">מחזורים שמורים</div>
        <SavedSessionsList sessions={sessions} onPick={setSelectedSessionId} />
      </div>
    </div>
  );
}
function SavedSessionsList({ sessions, onPick }) {
  if (!sessions.length) return <p className="muted">אין מחזורים שמורים עדיין.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {sessions.map((s) => (
        <button key={s.id} className="btn" onClick={() => onPick(s.id)}>
          {new Date(s.date).toLocaleDateString()} — {s.teams.length} קבוצות
        </button>
      ))}
    </div>
  );
}

/* ---------------- דירוג ---------------- */
function RankingScreen({ sessions }) {
  const [withBonus, setWithBonus] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const filtered = useMemo(
    () =>
      sessions.filter((s) => {
        const d = new Date(s.date);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      }),
    [sessions, month, year]
  );

  // מלך השערים
  const sumGoals = (arr) => {
    const m = new Map();
    for (const s of arr)
      for (const t of s.teams)
        for (const p of t.players) m.set(p.name, (m.get(p.name) || 0) + Number(p.goals || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const monthlyGoals = sumGoals(filtered);
  const yearlyGoals = sumGoals(sessions.filter((s) => new Date(s.date).getFullYear() === year));

  // אליפות החודש
  const monthlyChamp = useMemo(() => {
    const pts = new Map();
    for (const s of filtered) {
      for (const t of s.teams) {
        const wins = t.wins ?? (t.result === "W" ? 1 : 0);
        const draws = t.draws ?? (t.result === "D" ? 1 : 0);
        const teamPts = 3 * Number(wins) + 1 * Number(draws);
        for (const p of t.players) {
          const bonus = withBonus ? Number(p.goals || 0) * 0.1 : 0;
          pts.set(p.name, (pts.get(p.name) || 0) + teamPts + bonus);
        }
      }
    }
    return [...pts.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtered, withBonus]);

  // פירוט מחזורים
  const [openId, setOpenId] = useState(null);
  const open = sessions.find((s) => s.id === openId) || null;

  return (
    <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
      <div className="card wide" style={{ flex: 1 }}>
        <div className="section-title">מלך השערים — חודשי</div>
        <table className="table pretty">
          <tbody>
            {monthlyGoals.map(([n, v], i) => (
              <tr key={n}>
                <td>{i + 1}</td>
                <td>{n}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card wide" style={{ flex: 1 }}>
        <div className="section-title">מלך השערים — שנתי</div>
        <table className="table pretty">
          <tbody>
            {yearlyGoals.map(([n, v], i) => (
              <tr key={n}>
                <td>{i + 1}</td>
                <td>{n}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card wide" style={{ flex: 1 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="section-title">אליפות החודש {withBonus ? "(כולל בונוסים)" : ""}</div>
          <label className="switch">
            <input type="checkbox" checked={withBonus} onChange={(e) => setWithBonus(e.target.checked)} /> עם בונוס
          </label>
        </div>
        <table className="table pretty">
          <tbody>
            {monthlyChamp.map(([n, v], i) => (
              <tr key={n}>
                <td>{i + 1}</td>
                <td>{n}</td>
                <td>{v.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ width: 360 }}>
        <div className="section-title">מחזורים</div>
        {!sessions.length && <p className="muted">אין מחזורים עדיין.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map((s) => (
            <button key={s.id} className="btn" onClick={() => setOpenId(s.id)}>
              {new Date(s.date).toLocaleDateString()} — {s.teams.length} קבוצות
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div className="card wide" style={{ flex: 1 }}>
          <div className="section-title">מחזור — {new Date(open.date).toLocaleDateString()}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
            {open.teams.map((t, ti) => (
              <div key={ti} className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>קבוצה {ti + 1}</strong>
                  <span className="muted">
                    {t.wins ?? 0} נצ׳ · {t.draws ?? 0} תיקו · {t.losses ?? 0} הפס׳
                  </span>
                </div>
                <ul style={{ margin: "6px 0 0" }}>
                  {t.players.map((p) => (
                    <li key={p.id}>
                      {p.name} — {p.goals || 0}⚽
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ width: 260 }}>
        <div className="section-title">פילטר</div>
        <label>
          חודש:{" "}
          <select className="mini" value={month} onChange={(e) => setMonth(+e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginInlineStart: 8 }}>
          שנה:{" "}
          <select className="mini" value={year} onChange={(e) => setYear(+e.target.value)}>
            {Array.from({ length: 6 }, (_, i) => (
              <option key={i} value={year - 3 + i}>
                {year - 3 + i}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
