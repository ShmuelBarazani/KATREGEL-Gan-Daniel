import { useEffect, useMemo, useRef, useState } from "react";
import { buildBalancedTeams, avg, sum } from "./logic/balance";

// מצב שמור
const LS_KEY = "katregel_state_v12";
const uid = () => Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
const POS = [["GK", "שוער"], ["DF", "הגנה"], ["MF", "קישור"], ["FW", "התקפה"]];
const RSTEPS = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5);

// מצב הרשאות
const MODE = new URLSearchParams(location.search).get("mode") === "viewer" ? "viewer" : "admin";

function useStore() {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : { players: [], sessions: [] };
    } catch {
      return { players: [], sessions: [] };
    }
  });
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} }, [state]);
  return [state, setState];
}
const roleName = (c) => ({ GK: "שוער", DF: "הגנה", MF: "קישור", FW: "התקפה" }[c] || c);
const normRole = (v) => {
  const t = (v || "").toString().trim().toLowerCase();
  if (["gk", "ש"].includes(t)) return "GK";
  if (["df", "ה", "בלם", "מגן", "הגנה"].includes(t)) return "DF";
  if (["mf", "ק", "קישור", "קשר"].includes(t)) return "MF";
  if (["fw", "ח", "חלוץ", "כנף", "התקפה"].includes(t)) return "FW";
  return ["GK", "DF", "MF", "FW"].includes(v) ? v : "MF";
};

export default function App() {
  const [store, setStore] = useStore();

  // טאב פתיחה לפי הרשאות
  const [tab, setTab] = useState(MODE === "viewer" ? "ranking" : "teams");
  const [numTeams, setNumTeams] = useState(4);
  const [teams, setTeams] = useState([]);

  // “קבע מחזור” – מחזור עבודה נוכחי
  const [roundDraft, setRoundDraft] = useState(null);

  useEffect(() => {
    // טעינת players.json בפעם הראשונה
    (async () => {
      if (store.players.length) return;
      try {
        const r = await fetch("/players.json", { cache: "no-store" });
        if (!r.ok) return;
        const txt = await r.text();
        try {
          const raw = JSON.parse(txt);
          const arr = Array.isArray(raw) ? raw : [];
          if (arr.length) {
            const players = arr
              .map((p) => ({
                id: p.id || uid(),
                name: p.name || p.שם,
                role: normRole(p.role || p.תפקיד || "MF"),
                rating: Number(p.rating || p.ציון || 7),
                selected: p.selected ?? true,
                prefer: Array.isArray(p.prefer) ? p.prefer : [],
                avoid: Array.isArray(p.avoid) ? p.avoid : [],
              }))
              .filter((x) => x.name);
            setStore((s) => ({ ...s, players }));
          }
        } catch {}
      } catch {}
    })();
  }, []);

  const selected = useMemo(() => store.players.filter((p) => p.selected), [store.players]);
  const selectedCount = selected.length;

  // פעולות נתונים
  const addPlayer = (p) => setStore((s) => ({ ...s, players: [...s.players, { id: uid(), ...p }] }));
  const updatePlayer = (id, patch) =>
    setStore((s) => ({ ...s, players: s.players.map((p) => (String(p.id) === String(id) ? { ...p, ...patch } : p)) }));
  const removePlayer = (id) =>
    setStore((s) => ({ ...s, players: s.players.filter((p) => String(p.id) !== String(id)) }));

  // בניית כוחות
  const makeTeams = () => {
    const t = buildBalancedTeams(store.players, numTeams);
    setTeams(t);
    if (MODE !== "viewer") setTab("teams");
  };

  // קבע מחזור – מקבע את חלוקת הכוחות ומכין מסך ניהול מחזור
  const lockRound = () => {
    if (!teams.length) return alert("קודם צריך לעשות כוחות");
    const snapshot = teams.map((g) => g.map((p) => ({ id: p.id, name: p.name })));
    const draft = {
      id: uid(),
      date: new Date().toISOString(),
      teams: snapshot.map((list) => ({ result: "D", players: list.map((pl) => ({ ...pl, goals: 0 })) })),
    };
    setRoundDraft(draft);
    setTab("rounds");
  };

  // שמירת מחזור
  const saveRound = (draft) => {
    setStore((s) => ({ ...s, sessions: [...s.sessions, draft] }));
    setRoundDraft(null);
    setTab("ranking");
  };

  return (
    <div className="page">
      <div className="appbar">
        <div className="title">⚽ קטרגל — גן-דניאל</div>
        <div className="tabs">
          {MODE !== "viewer" && (
            <>
              <button className={`tab ${tab === "teams" ? "active" : ""}`} onClick={() => setTab("teams")}>כוחות</button>
              <button className={`tab ${tab === "players" ? "active" : ""}`} onClick={() => setTab("players")}>שחקנים</button>
              <button className={`tab ${tab === "rounds" ? "active" : ""}`} onClick={() => setTab("rounds")}>ניהול מחזורים ותוצאות</button>
            </>
          )}
          <button className={`tab ${tab === "ranking" ? "active" : ""}`} onClick={() => setTab("ranking")}>דירוג</button>
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
          onSave={saveRound}
        />
      )}

      {tab === "ranking" && (
        <RankingScreen sessions={store.sessions} />
      )}
    </div>
  );
}

/* ---------- מסך כוחות ---------- */
function TeamsScreen({ players, update, remove, add, numTeams, setNumTeams, makeTeams, teams, setTeams, onLockRound }) {
  const [sortBy, setSort] = useState("name");
  const [dir, setDir] = useState("asc");

  const sortedPlayers = useMemo(() => {
    const a = [...players];
    const cmp = {
      name: (x, y) => x.name.localeCompare(y.name, "he"),
      role: (x, y) => roleName(x.role).localeCompare(roleName(y.role), "he"),
      rating: (x, y) => x.rating - y.rating,
      selected: (x, y) => Number(x.selected) - Number(y.selected),
    }[sortBy];
    a.sort(cmp || (() => 0));
    if (dir === "desc") a.reverse();
    return a;
  }, [players, sortBy, dir]);

  const onSort = (col) => setSort((p) => {
    if (p === col) { setDir((d) => (d === "asc" ? "desc" : "asc")); return p; }
    setDir("asc"); return col;
  });

  // גרירה מרשימה → לקבוצה, מוודא ללא כפילויות
  const startDragFromList = (e, pid) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ pid, from: "list" }));
    e.dataTransfer.effectAllowed = "move";
  };
  const startDragFromTeam = (e, pid, fromIdx) => {
    e.dataTransfer.setData("application/json", JSON.stringify({ pid, from: fromIdx }));
    e.dataTransfer.effectAllowed = "move";
  };
  const allowDrop = (e) => { e.preventDefault(); e.currentTarget.classList.add("over"); };
  const leaveDrop = (e) => e.currentTarget.classList.remove("over");
  const dropToTeam = (e, to) => {
    e.preventDefault(); e.currentTarget.classList.remove("over");
    const data = JSON.parse(e.dataTransfer.getData("application/json") || "{}");
    if (!data.pid && data.pid !== 0) return;
    setTeams((prev) => {
      const next = prev.map((t) => [...t]);
      // מחיקה מכל מקום
      for (let i = 0; i < next.length; i++) {
        const j = next[i].findIndex((p) => String(p.id) === String(data.pid));
        if (j >= 0) next[i].splice(j, 1);
      }
      // הוספה אם לא קיים
      if (!next[to].some((p) => String(p.id) === String(data.pid))) {
        const pl = players.find((p) => String(p.id) === String(data.pid));
        if (pl) next[to].push(pl);
      }
      // מיון יורד ע"פ ציון
      return next.map((t) => t.sort((a, b) => b.rating - a.rating));
    });
  };

  // תצוגת הדפסה
  const [printOpen, setPrintOpen] = useState(false);

  const means = teams.map((t) => (t.length ? avg(t.map((p) => p.rating)) : 0));

  return (
    <div className="card">
      <div className="controls" style={{ marginBottom: 10 }}>
        <span className="badge">{numTeams}</span>
        <button className="btn" onClick={() => setNumTeams((n) => Math.max(2, n - 1))}>−</button>
        <button className="btn" onClick={() => setNumTeams((n) => Math.min(8, n + 1))}>+</button>
        <button className="btn primary" onClick={makeTeams}>עשה כוחות</button>
        <button className="btn" onClick={() => setPrintOpen(true)}>תצוגת הדפסה</button>
        <button className="btn" onClick={onLockRound}>קבע מחזור</button>
      </div>

      {/* קבוצות למעלה */}
      <div className="teamsTop">
        <div className="teamsGrid">
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
                <div key={p.id} className="player-line" draggable onDragStart={(e) => startDragFromTeam(e, p.id, i)}>
                  <span><span className="handle">⋮⋮</span> {p.name}</span>
                  <span className="subtle">{roleName(p.role)} · {p.rating}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* רשימת שחקנים למטה */}
      <div className="playersBelow">
        <table className="table">
          <thead>
            <tr>
              <th className="th-sort" onClick={() => onSort("selected")}>משחק?</th>
              <th className="th-sort" onClick={() => onSort("name")}>שם</th>
              <th className="th-sort" onClick={() => onSort("role")}>עמדה</th>
              <th className="th-sort" onClick={() => onSort("rating")}>ציון</th>
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
                  <input type="checkbox" checked={!!p.selected} onChange={(e) => update(p.id, { selected: e.target.checked })} />
                </td>
                <td><input className="mini" value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} /></td>
                <td>
                  <select className="mini" value={p.role} onChange={(e) => update(p.id, { role: e.target.value })}>
                    {POS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </td>
                <td>
                  <select className="mini" value={p.rating} onChange={(e) => update(p.id, { rating: Number(e.target.value) })}>
                    {RSTEPS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td><div className="chips">{(p.prefer || []).map((n) => <span key={n} className="chip">{n}</span>)}</div></td>
                <td><div className="chips">{(p.avoid || []).map((n) => <span key={n} className="chip hollow">{n}</span>)}</div></td>
                <td><button className="btn danger" onClick={() => remove(p.id)}>מחק</button></td>
                <td title="גרור לקבוצה"><span className="handle" draggable onDragStart={(e) => startDragFromList(e, p.id)}>⋮⋮</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {printOpen && <PrintPreview teams={teams} onClose={() => setPrintOpen(false)} />}
    </div>
  );
}

/* תצוגת הדפסה — עמוד אחד */
function PrintPreview({ teams, onClose }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="modal printModal" onClick={onClose}>
      <div className="box" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <button className="btn primary" onClick={() => window.print()}>יצוא PDF / הדפס</button>
          <button className="btn" onClick={onClose}>סגור</button>
        </div>
        <div className="sheetGrid">
          {teams.map((team, idx) => (
            <div key={idx} className="sheet">
              <div className="sheetHeader">
                <div>תאריך: {today}</div>
                <div>קבוצה {idx + 1}</div>
              </div>
              <table className="sheetTable">
                <thead><tr><th style={{ width: "65%" }}>שחקן</th><th>שערים</th></tr></thead>
                <tbody>
                  {team.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>
                        <div className="boxes">
                          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="box" />)}
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
                    <div className="boxes">{Array.from({ length: 6 }).map((_, j) => <div key={j} className="box" />)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- מסך שחקנים ---------- */
function PlayersScreen({ players, update, remove, add }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", role: "DF", rating: 7, selected: true });

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn primary" onClick={() => setShowAdd(true)}>הוסף שחקן</button>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>משחק?</th><th>שם</th><th>עמדה</th><th>ציון</th><th>חייב עם</th><th>לא עם</th><th>מחק</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id}>
              <td style={{ textAlign: "center" }}>
                <input type="checkbox" checked={!!p.selected} onChange={(e) => update(p.id, { selected: e.target.checked })} />
              </td>
              <td><input className="mini" value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} /></td>
              <td>
                <select className="mini" value={p.role} onChange={(e) => update(p.id, { role: e.target.value })}>
                  {POS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </td>
              <td>
                <select className="mini" value={p.rating} onChange={(e) => update(p.id, { rating: Number(e.target.value) })}>
                  {RSTEPS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </td>
              <td><div className="chips">{(p.prefer || []).map((n) => <span key={n} className="chip">{n}</span>)}</div></td>
              <td><div className="chips">{(p.avoid || []).map((n) => <span key={n} className="chip hollow">{n}</span>)}</div></td>
              <td><button className="btn danger" onClick={() => remove(p.id)}>מחק</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {showAdd && (
        <div className="modal" onClick={() => setShowAdd(false)}>
          <div className="box" onClick={(e) => e.stopPropagation()}>
            <h3>הוספת שחקן</h3>
            <div className="row">
              <input className="mini" placeholder="שם" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <select className="mini" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                {POS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <select className="mini" value={form.rating} onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))}>
                {RSTEPS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <label className="switch"><input type="checkbox" checked={form.selected} onChange={(e) => setForm((f) => ({ ...f, selected: e.target.checked }))} /> משחק?</label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" onClick={() => setShowAdd(false)}>סגור</button>
              <button className="btn primary" onClick={() => { if (!form.name.trim()) return; add(form); setForm({ name: "", role: "DF", rating: 7, selected: true }); setShowAdd(false); }}>שמור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- ניהול מחזורים ותוצאות ---------- */
function RoundsManager({ draft, setDraft, sessions, onSave }) {
  // אם אין דראפט – אפשר לבחור מחזור שמור כדי לצפות/לערוך
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const current = useMemo(() => {
    if (draft) return draft;
    const s = sessions.find((x) => x.id === selectedSessionId);
    return s || null;
  }, [draft, sessions, selectedSessionId]);

  if (!current)
    return (
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>ניהול מחזורים ותוצאות</strong>
          <span className="muted">בחר מחזור שמור כדי לצפות / לערוך</span>
        </div>
        <SavedSessionsList sessions={sessions} onPick={setSelectedSessionId} />
      </div>
    );

  const setRes = (ti, val) =>
    setDraft((d) => ({ ...(d || current), teams: (d || current).teams.map((t, i) => (i === ti ? { ...t, result: val } : t)) }));
  const setGoal = (ti, pid, val) =>
    setDraft((d) => ({
      ...(d || current),
      teams: (d || current).teams.map((t, i) =>
        i !== ti
          ? t
          : { ...t, players: t.players.map((p) => (p.id === pid ? { ...p, goals: Math.max(0, parseInt(val || "0", 10) || 0) } : p)) }
      ),
    }));

  const save = () => onSave(draft || current);

  // רשימת שחקנים לכל המחזור (לטבלת “שערים למחזור”)
  const allPlayers = current.teams.flatMap((t) => t.players);

  return (
    <div className="row" style={{gap:12, alignItems:'flex-start'}}>
      <div className="card" style={{flex:1}}>
        <div className="section-title">תוצאות המחזור — {new Date(current.date).toLocaleDateString()}</div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12}}>
          {current.teams.map((t, ti) => (
            <div key={ti} className="card">
              <div className="row" style={{justifyContent:'space-between', alignItems:'baseline'}}>
                <strong>קבוצה {ti+1} <span className="muted" style={{fontWeight:400, fontSize:12}}>
                  ({t.players.map(p=>p.name).join(", ")})
                </span></strong>
                <div>
                  <label style={{marginInlineStart:8}}><input type="radio" name={"r"+ti} checked={t.result==='W'} onChange={()=>setRes(ti,'W')}/> ניצחון</label>
                  <label style={{marginInlineStart:8}}><input type="radio" name={"r"+ti} checked={t.result==='D'} onChange={()=>setRes(ti,'D')}/> תיקו</label>
                  <label style={{marginInlineStart:8}}><input type="radio" name={"r"+ti} checked={t.result==='L'} onChange={()=>setRes(ti,'L')}/> הפסד</label>
                </div>
              </div>
              <table className="table">
                <thead><tr><th>שם</th><th style={{width:120}}>שערים</th></tr></thead>
                <tbody>
                  {t.players.map((p)=>(
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td><input className="mini" type="number" min="0" value={p.goals||0} onChange={(e)=>setGoal(ti,p.id,e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="row" style={{marginTop:10}}>
          <button className="btn primary" onClick={save}>שמור מחזור</button>
        </div>
      </div>

      <div className="card" style={{flex:1}}>
        <div className="section-title">שערים למחזור</div>
        <table className="table">
          <thead><tr><th>#</th><th>שם</th><th style={{width:120}}>שערים</th></tr></thead>
          <tbody>
            {allPlayers.map((p,idx)=>(
              <tr key={`${p.id}-${idx}`}>
                <td>{idx+1}</td>
                <td>{p.name}</td>
                <td>{p.goals||0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{width:340}}>
        <div className="section-title">מחזורים שמורים</div>
        <SavedSessionsList sessions={sessions} onPick={setSelectedSessionId} />
      </div>
    </div>
  );
}
function SavedSessionsList({ sessions, onPick }) {
  if (!sessions.length) return <p className="muted">אין מחזורים שמורים עדיין.</p>;
  return (
    <div style={{display:'flex', flexDirection:'column', gap:8}}>
      {sessions.map((s)=>(
        <button key={s.id} className="btn" onClick={()=>onPick(s.id)}>
          {new Date(s.date).toLocaleDateString()} — {s.teams.length} קבוצות
        </button>
      ))}
    </div>
  );
}

/* ---------- מסך דירוג ---------- */
function RankingScreen({ sessions }) {
  const [withBonus, setWithBonus] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const filtered = useMemo(() => sessions.filter(s => {
    const d = new Date(s.date);
    return d.getFullYear() === year && (d.getMonth()+1) === month;
  }), [sessions, month, year]);

  // טבלאות דירוג
  const listGoals = (arr) => {
    const m=new Map(); for(const s of arr){for(const t of s.teams){for(const p of t.players){m.set(p.name,(m.get(p.name)||0)+Number(p.goals||0))}}}
    return [...m.entries()].sort((a,b)=>b[1]-a[1]);
  };
  const monthlyGoals = listGoals(filtered);
  const yearlyGoals = listGoals(sessions.filter(s=> new Date(s.date).getFullYear()===year));
  const monthlyChamp = useMemo(()=>{
    const pts=new Map();
    for(const s of filtered){
      for(const t of s.teams){
        const tp = t.result==='W'?3 : t.result==='D'?1 : 0;
        for(const p of t.players){
          pts.set(p.name,(pts.get(p.name)||0)+tp+(withBonus? (Number(p.goals||0)*0.1):0));
        }
      }
    }
    return [...pts.entries()].sort((a,b)=>b[1]-a[1]);
  },[filtered,withBonus]);

  // רשימת מחזורים + פירוט
  const [openId,setOpenId]=useState(null);
  const open = sessions.find(s=>s.id===openId)||null;

  return (
    <div className="row" style={{gap:12, alignItems:'flex-start'}}>
      <div className="card" style={{flex:1}}>
        <div className="section-title">מלך השערים — חודשי</div>
        <ol>{monthlyGoals.map(([n,v])=><li key={n}>{n} — {v}</li>)}</ol>
      </div>
      <div className="card" style={{flex:1}}>
        <div className="section-title">מלך השערים — שנתי</div>
        <ol>{yearlyGoals.map(([n,v])=><li key={n}>{n} — {v}</li>)}</ol>
      </div>
      <div className="card" style={{flex:1}}>
        <div className="row" style={{justifyContent:'space-between', alignItems:'baseline'}}>
          <div className="section-title">אליפות החודש {withBonus?'(כולל בונוסים)':''}</div>
          <label className="switch"><input type="checkbox" checked={withBonus} onChange={e=>setWithBonus(e.target.checked)}/> עם בונוס</label>
        </div>
        <ol>{monthlyChamp.map(([n,v])=><li key={n}>{n} — {v.toFixed(2)}</li>)}</ol>
      </div>

      {/* רשימת מחזורים ותצוגת פירוט */}
      <div className="card" style={{width:360}}>
        <div className="section-title">מחזורים</div>
        {!sessions.length && <p className="muted">אין מחזורים עדיין.</p>}
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {sessions.map(s=>(
            <button key={s.id} className="btn" onClick={()=>setOpenId(s.id)}>
              {new Date(s.date).toLocaleDateString()} — {s.teams.length} קבוצות
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div className="card" style={{flex:1}}>
          <div className="section-title">מחזור — {new Date(open.date).toLocaleDateString()}</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12}}>
            {open.teams.map((t,ti)=>(
              <div key={ti} className="card">
                <div className="row" style={{justifyContent:'space-between'}}>
                  <strong>קבוצה {ti+1}</strong>
                  <span className="muted">{t.result==='W'?'ניצחון':t.result==='D'?'תיקו':'הפסד'}</span>
                </div>
                <ul style={{margin:'6px 0 0'}}>
                  {t.players.map(p=><li key={p.id}>{p.name} — {p.goals||0}⚽</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* פילטר תאריך */}
      <div className="card" style={{width:260}}>
        <div className="section-title">פילטר</div>
        <label>חודש: <select className="mini" value={month} onChange={e=>setMonth(+e.target.value)}>
          {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}
        </select></label>
        <label style={{marginInlineStart:8}}>שנה: <select className="mini" value={year} onChange={e=>setYear(+e.target.value)}>
          {Array.from({length:6},(_,i)=><option key={i} value={year-3+i}>{year-3+i}</option>)}
        </select></label>
      </div>
    </div>
  );
}
