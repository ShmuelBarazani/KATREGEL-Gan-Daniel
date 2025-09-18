import { useEffect, useMemo, useState } from "react";

/** App.jsx — תומך בקובץ players.json עם שדות: id, name, r, pos, selected, prefer, avoid
 *  - טעינה אוטומטית מ־/players.json אם אין נתונים שמורים
 *  - טעינה ידנית (הוספה/החלפה), ייצוא CSV
 *  - שמירה אוטומטית ב-localStorage
 */

const LS_KEY = "myTeamsApp_v4";

function usePersistedState(defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch { return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
  }, [state]);
  return [state, setState];
}

/** נירמול תפקידים */
const normalizeRole = (val) => {
  const t = (val ?? "").toString().trim().toLowerCase();
  if (["gk","ש","שוער"].includes(t)) return "GK";
  if (["df","ה","הגנה","בלם","מגן"].includes(t)) return "DF";
  if (["mf","ק","קישור","קשר"].includes(t)) return "MF";
  if (["fw","ח","התקפה","חלוץ","כנף"].includes(t)) return "FW";
  return ["GK","DF","MF","FW"].includes((val||"").toString()) ? val : "MF";
};

/** פרסור קלט כללי: JSON (תומך גם pos/r) או CSV/שורות */
const parsePlayersText = (text) => {
  text = (text || "").trim();
  if (!text) return [];
  // JSON
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj)) {
      return obj.map(x => ({
        id: x.id ?? undefined,
        name: x.name ?? x.שם,
        role: normalizeRole(x.role ?? x.תפקיד ?? x.pos),
        rating: Number(x.rating ?? x.ציון ?? x.r),
        selected: Boolean(x.selected),
        prefer: Array.isArray(x.prefer) ? x.prefer.map(String) : [],
        avoid: Array.isArray(x.avoid) ? x.avoid.map(String) : [],
      })).filter(x => x.name && !Number.isNaN(x.rating));
    }
  } catch {}
  // CSV/שורות: שם,תפקיד,ציון וכד'
  const rows = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const out = [];
  for (const r of rows) {
    const parts = r.split(/[\t,;|]/).map(s=>s.trim()).filter(Boolean);
    if (parts.length===1) out.push({ name: parts[0], role:"MF", rating:7 });
    else {
      const [nm, rl, rt] = parts;
      out.push({ name:nm, role: normalizeRole(rl), rating: Number(rt||7) });
    }
  }
  return out.filter(x=>x.name);
};

export default function App() {
  const [data, setData] = usePersistedState({ players: [], sessions: [] });
  const [tab, setTab] = useState("players");

  // טופס ידני
  const [name, setName] = useState("");
  const [role, setRole] = useState("GK");
  const ratingOptions = useMemo(() => Array.from({length:19}, (_,i)=> (1 + i*0.5)), []);
  const [rating, setRating] = useState("");

  // כוחות
  const [teams, setTeams] = useState([]);

  const playersById = useMemo(
    () => new Map(data.players.map(p => [String(p.id), p])),
    [data.players]
  );

  const ranking = useMemo(() =>
    [...data.players]
      .map(p => ({ name: p.name, points: Math.round(Number(p.rating) * 10) }))
      .sort((a,b)=>b.points-a.points),
    [data.players]
  );

  const randomId = () => Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);

  /** טעינה אוטומטית מה-public/players.json (אם אין נתונים עד כה) */
  useEffect(() => {
    (async () => {
      if (data.players.length > 0) return;
      try {
        const res = await fetch("/players.json", { cache: "no-store" });
        if (!res.ok) return;
        const text = await res.text();
        const parsed = parsePlayersText(text);
        if (parsed.length) {
          const mapped = parsed.map(p => ({
            id: p.id !== undefined ? String(p.id) : randomId(),
            name: p.name,
            role: p.role,
            rating: Number(p.rating ?? 7),
            selected: Boolean(p.selected),
            prefer: p.prefer ?? [],
            avoid: p.avoid ?? [],
          }));
          setData(prev => ({ ...prev, players: mapped }));
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** פעולות על שחקנים */
  const addPlayer = () => {
    if (!name.trim() || !rating) { alert("מלא שם וציון"); return; }
    setData(prev => ({
      ...prev,
      players: [...prev.players, {
        id: randomId(), name: name.trim(), role, rating: Number(rating), selected: true, prefer: [], avoid: []
      }]
    }));
    setName(""); setRating("");
  };
  const removePlayer = (id) => {
    if (!confirm("למחוק את השחקן?")) return;
    setData(prev => ({ ...prev, players: prev.players.filter(p=>String(p.id)!==String(id)) }));
    setTeams(t => t.map(team => team.filter(pid => String(pid)!==String(id))));
  };
  const updatePlayer = (id, fields) => {
    setData(prev => ({
      ...prev,
      players: prev.players.map(p => String(p.id)===String(id) ? { ...p, ...fields } : p)
    }));
  };

  /** כוחות — אם יש נבחרים (selected=true) נשתמש רק בהם */
  const makeTeams = (numTeams=2) => {
    const pool = data.players.some(p=>p.selected) ? data.players.filter(p=>p.selected) : data.players;
    if (pool.length < numTeams) { alert(`צריך לפחות ${numTeams} שחקנים במאגר הנוכחי`); return; }
    const sorted = [...pool].sort((a,b)=>Number(b.rating)-Number(a.rating));
    const out = Array.from({length:numTeams}, ()=>[]);
    let idx = 0, dir = 1;
    for (const p of sorted){
      out[idx].push(String(p.id));
      idx += dir;
      if (idx===numTeams){ idx=numTeams-1; dir=-1; }
      else if (idx<0){ idx=0; dir=1; }
    }
    setTeams(out); setTab("teams");
  };
  const clearTeams = () => setTeams([]);

  /** ייבוא/ייצוא */
  const importPlayers = async ({mode, fromFile, pastedText}) => {
    let text = pastedText || "";
    if (fromFile) text = await fromFile.text();
    const parsed = parsePlayersText(text);
    if (!parsed.length){ alert("לא זוהו שחקנים בקלט"); return; }

    if (mode === "replace") {
      const mapped = parsed.map(p => ({
        id: p.id !== undefined ? String(p.id) : randomId(),
        name: p.name, role: p.role,
        rating: Number(p.rating ?? 7),
        selected: Boolean(p.selected),
        prefer: p.prefer ?? [],
        avoid: p.avoid ?? [],
      }));
      setData(prev => ({ ...prev, players: mapped }));
      setTeams([]);
      alert(`נטענו ${mapped.length} שחקנים (החלפה מלאה).`);
    } else {
      setData(prev => {
        const existingKeys = new Set(prev.players.map(p => (p.name+"|"+p.role)));
        const toAdd = [];
        for (const p of parsed){
          const key = (p.name+"|"+p.role);
          if (!existingKeys.has(key)){
            toAdd.push({
              id: p.id !== undefined ? String(p.id) : randomId(),
              name: p.name, role: p.role,
              rating: Number(p.rating ?? 7),
              selected: Boolean(p.selected),
              prefer: p.prefer ?? [],
              avoid: p.avoid ?? [],
            });
          }
        }
        return { ...prev, players: [...prev.players, ...toAdd] };
      });
      alert("הייבוא הושלם (התווספו רק מי שלא קיימים).");
    }
  };

  const importFromPublicJson = (mode="add") =>
    fetch("/players.json",{cache:"no-store"})
      .then(r=>r.ok?r.text():Promise.reject())
      .then(txt=>importPlayers({mode, pastedText: txt}))
      .catch(()=>alert("לא נמצא players.json ב-public"));

  const exportPlayers = () => {
    const rows = [["id","name","pos","r","selected","prefer","avoid"]];
    for (const p of data.players) rows.push([
      p.id, p.name, p.role, p.rating, Boolean(p.selected),
      JSON.stringify(p.prefer||[]), JSON.stringify(p.avoid||[])
    ]);
    const csv = rows.map(r=>r.map(x=>String(x).replace(/"/g,'""')).map(x=>`"${x}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "players.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  /** UI קטנים */
  const Field = ({label, children}) => (
    <label style={{display:"grid", gap:6}}>
      <span className="muted" style={{paddingInlineStart:2}}>{label}</span>
      {children}
    </label>
  );
  const Card = ({title, children}) => (
    <div className="card" style={{display:"grid", gap:10}}>
      {title ? <h3 style={{margin:0}}>{title}</h3> : null}
      {children}
    </div>
  );

  /** טאבים */
  const PlayersTab = () => {
    const [pasteText, setPasteText] = useState("");

    const handleFile = async (e, mode) => {
      const f = e.target.files?.[0];
      if (!f) return;
      await importPlayers({ mode, fromFile: f });
      e.target.value = "";
    };

    return (
      <div className="grid">
        <Card title="הוספת שחקן ידנית">
          <div className="row">
            <Field label="שם">
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="שם שחקן" />
            </Field>
            <Field label="תפקיד">
              <select value={role} onChange={e=>setRole(e.target.value)}>
                <option value="GK">שוער</option>
                <option value="DF">הגנה</option>
                <option value="MF">קישור</option>
                <option value="FW">התקפה</option>
              </select>
            </Field>
            <Field label="ציון (1–10)">
              <select value={rating} onChange={e=>setRating(e.target.value)} style={{minWidth:120}}>
                <option value="" disabled>בחר</option>
                {ratingOptions.map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <button className="btn-primary" onClick={addPlayer}>הוסף</button>
          </div>
        </Card>

        <Card title="ייבוא/ייצוא שחקנים">
          <div className="row">
            <button onClick={exportPlayers}>ייצוא CSV</button>
            <span className="muted">נתמך: JSON / CSV / הדבקה</span>
          </div>
          <hr/>
          <div className="row" style={{alignItems:"stretch"}}>
            <Field label="ייבוא מקובץ (הוספה)">
              <input type="file" accept=".json,.csv,.txt" onChange={(e)=>handleFile(e,"add")} />
            </Field>
            <Field label="ייבוא מקובץ (החלפה מלאה)">
              <input type="file" accept=".json,.csv,.txt" onChange={(e)=>handleFile(e,"replace")} />
            </Field>
          </div>

          <div className="row">
            <Field label="ייבוא מה-public/players.json">
              <div className="row">
                <button className="btn-primary" onClick={()=>importFromPublicJson("add")}>טען (הוספה)</button>
                <button onClick={()=>importFromPublicJson("replace")}>טען (החלפה מלאה)</button>
                <span className="muted">שים/עדכן את הקובץ ב־public/players.json</span>
              </div>
            </Field>
          </div>

          <div className="row" style={{alignItems:"stretch"}}>
            <Field label="או הדבקה חופשית (JSON או שם,תפקיד,ציון בשורה)">
              <textarea rows={5}
                placeholder={`דוגמאות:
{"id":41,"name":"שמוליק","pos":"FW","r":4.5,"selected":true}
מאור כהן, קישור, 7.5`}
                onChange={e=>setPasteText(e.target.value)}
              />
            </Field>
          </div>
          <div className="row">
            <button className="btn-primary" onClick={()=>importPlayers({mode:"add", pastedText: pasteText})}>ייבוא מהדבקה (הוספה)</button>
            <button onClick={()=>importPlayers({mode:"replace", pastedText: pasteText})}>ייבוא מהדבקה (החלפה מלאה)</button>
          </div>
        </Card>

        <Card title={`רשימת שחקנים (${data.players.length})`}>
          {data.players.length===0 ? (
            <p className="muted">אין שחקנים עדיין.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>פעיל</th><th>שם</th><th>תפקיד</th><th>ציון</th><th></th></tr>
              </thead>
              <tbody>
                {[...data.players].sort((a,b)=>a.name.localeCompare(b.name,"he")).map(p=>(
                  <tr key={p.id}>
                    <td>
                      <input type="checkbox" checked={!!p.selected} onChange={e=>updatePlayer(p.id,{selected:e.target.checked})} />
                    </td>
                    <td>{p.name}</td>
                    <td>
                      <select value={p.role} onChange={e=>updatePlayer(p.id,{role:e.target.value})}>
                        <option value="GK">שוער</option>
                        <option value="DF">הגנה</option>
                        <option value="MF">קישור</option>
                        <option value="FW">התקפה</option>
                      </select>
                    </td>
                    <td>
                      <select value={p.rating} onChange={e=>updatePlayer(p.id,{rating:Number(e.target.value)})}>
                        {ratingOptions.map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td><button onClick={()=>removePlayer(p.id)}>מחק</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted" style={{marginTop:8}}>אם יש שחקנים מסומנים "פעיל" – בניית הכוחות תשתמש רק בהם.</p>
        </Card>
      </div>
    );
  };

  const TeamsTab = () => (
    <div className="grid">
      <Card title="ניהול כוחות">
        <div className="row">
          <button className="btn-primary" onClick={()=>makeTeams(2)}>בנה 2 כוחות</button>
          <button onClick={()=>makeTeams(3)}>בנה 3 כוחות</button>
          <button onClick={()=>makeTeams(4)}>בנה 4 כוחות</button>
          <button onClick={clearTeams}>נקה</button>
        </div>
        <p className="muted">חלוקה מאזנת לפי ציון (גבוה→נמוך לסירוגין). אם יש נבחרים — משתמש רק בהם.</p>
      </Card>

      {teams.length===0 ? (
        <Card><p className="muted">אין כוחות כרגע.</p></Card>
      ) : (
        teams.map((team,i)=>{
          const list = team.map(id=>playersById.get(String(id))).filter(Boolean);
          const avg = list.length? (list.reduce((s,p)=>s+Number(p.rating),0)/list.length).toFixed(2):"0.00";
          return (
            <Card key={i} title={`קבוצה ${i+1} · ממוצע ${avg}`}>
              <div style={{display:"grid",gap:6}}>
                {list.map(p=>(
                  <div key={p.id} className="row" style={{gap:8}}>
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
      <Card title="דירוג שחקנים">
        {ranking.length===0 ? <p className="muted">אין נתונים.</p> : (
          <table className="table">
            <thead><tr><th>#</th><th>שחקן</th><th>נק׳</th></tr></thead>
            <tbody>
              {ranking.map((r,idx)=>(
                <tr key={r.name+idx}>
                  <td>{idx+1}</td>
                  <td>{r.name}</td>
                  <td>{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );

  return (
    <div className="page">
      <h1>my-teams-app</h1>
      <div className="muted">תומך בקובץ players.json (pos/r/selected) · RTL · שמירה אוטומטית</div>

      <div className="row" style={{marginTop:14, marginBottom:12}}>
        <button className={`tab-btn ${tab==="players"?"active":""}`} onClick={()=>setTab("players")}>שחקנים</button>
        <button className={`tab-btn ${tab==="teams"?"active":""}`} onClick={()=>setTab("teams")}>כוחות</button>
        <button className={`tab-btn ${tab==="ranking"?"active":""}`} onClick={()=>setTab("ranking")}>דירוג</button>
      </div>

      {tab==="players" && <PlayersTab/>}
      {tab==="teams" && <TeamsTab/>}
      {tab==="ranking" && <RankingTab/>}
    </div>
  );
}

function roleName(code){
  return code==="GK"?"שוער":code==="DF"?"הגנה":code==="MF"?"קישור":code==="FW"?"התקפה":code||"";
}
