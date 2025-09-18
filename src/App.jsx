import { useEffect, useMemo, useState } from "react";

/** App.jsx — גרסה עם:
 * - טאבים: שחקנים / כוחות / דירוג
 * - ייבוא שחקנים (JSON/CSV/הדבקה) + מצב הוספה/החלפה
 * - ייצוא שחקנים לקובץ
 * - שמירה אוטומטית ב-localStorage
 */

const LS_KEY = "myTeamsApp_v2";

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

export default function App() {
  const [data, setData] = usePersistedState({ players: [], sessions: [] });
  const [tab, setTab] = useState("players");

  // טופס הוספת שחקן
  const [name, setName] = useState("");
  const [role, setRole] = useState("GK");
  const [rating, setRating] = useState("");

  // כוחות
  const [teams, setTeams] = useState([]);
  const playersById = useMemo(() => new Map(data.players.map(p => [p.id, p])), [data.players]);
  const ranking = useMemo(() =>
    [...data.players]
      .map(p => ({ name: p.name, points: Math.round(Number(p.rating) * 10) }))
      .sort((a,b)=>b.points-a.points), [data.players]);

  const newId = () => Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);

  /** ---------- שחקנים בסיסי ---------- */
  const addPlayer = () => {
    if (!name.trim() || !rating) { alert("מלא שם וציון"); return; }
    setData(prev => ({
      ...prev,
      players: [...prev.players, { id:newId(), name:name.trim(), role, rating:Number(rating) }]
    }));
    setName(""); setRating("");
  };
  const removePlayer = (id) => {
    if (!confirm("למחוק את השחקן?")) return;
    setData(prev => ({ ...prev, players: prev.players.filter(p=>p.id!==id) }));
    setTeams(t => t.map(team => team.filter(pid => pid!==id)));
  };
  const updatePlayer = (id, fields) => {
    setData(prev => ({ ...prev, players: prev.players.map(p => p.id===id?{...p,...fields}:p) }));
  };

  /** ---------- כוחות ---------- */
  const makeTeams = (numTeams=2) => {
    if (data.players.length < numTeams) { alert(`צריך לפחות ${numTeams} שחקנים`); return; }
    const sorted = [...data.players].sort((a,b)=>Number(b.rating)-Number(a.rating));
    const out = Array.from({length:numTeams}, ()=>[]);
    let idx = 0, dir = 1;
    for (const p of sorted){
      out[idx].push(p.id);
      idx += dir;
      if (idx===numTeams){ idx=numTeams-1; dir=-1; }
      else if (idx<0){ idx=0; dir=1; }
    }
    setTeams(out); setTab("teams");
  };
  const clearTeams = () => setTeams([]);

  /** ---------- ייבוא/ייצוא שחקנים ---------- */

  // ממפה טקסט תפקידים → קודים
  const normalizeRole = (val) => {
    const t = (val||"").toString().trim().toLowerCase();
    if (["gk","ש","שוער"].includes(t)) return "GK";
    if (["df","ה","הגנה","בלם","מגן"].includes(t)) return "DF";
    if (["mf","ק","קישור","קשר"].includes(t)) return "MF";
    if (["fw","ח","התקפה","חלוץ","כנף"].includes(t)) return "FW";
    return "MF";
  };

  // פרסור גמיש: JSON או CSV/טקסט
  const parsePlayersText = (text) => {
    text = text.trim();
    if (!text) return [];
    // JSON
    try {
      const obj = JSON.parse(text);
      if (Array.isArray(obj)) {
        return obj
          .map(x => ({ name:x.name||x.שם, role: normalizeRole(x.role||x.תפקיד), rating: Number(x.rating||x.ציון) }))
          .filter(x => x.name && x.rating);
      }
    } catch {}
    // CSV/שורות: שם,תפקיד,ציון  או  שם;תפקיד;ציון  או  שם|תפקיד|ציון  או  שם<tab>תפקיד<tab>ציון
    const rows = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    const out = [];
    for (const r of rows){
      const parts = r.split(/[\t,;|]/).map(s=>s.trim()).filter(Boolean);
      if (parts.length===1){ // רק שם
        out.push({ name: parts[0], role:"MF", rating:7 });
      } else {
        const [nm, rl, rt] = parts;
        out.push({ name:nm, role: normalizeRole(rl), rating: Number(rt||7) });
      }
    }
    return out.filter(x=>x.name);
  };

  const importPlayers = async ({mode, fromFile, pastedText}) => {
    let text = pastedText || "";
    if (fromFile) {
      text = await fromFile.text();
    }
    const parsed = parsePlayersText(text);
    if (!parsed.length){ alert("לא זוהו שחקנים בקלט"); return; }

    if (mode === "replace") {
      const mapped = parsed.map(p => ({ id:newId(), name:p.name, role:p.role, rating:Number(p.rating||7) }));
      setData(prev => ({ ...prev, players: mapped }));
      setTeams([]);
      alert(`נטענו ${mapped.length} שחקנים (החלפה מלאה).`);
    } else {
      // add / merge
      setData(prev => {
        const namesSet = new Set(prev.players.map(p => p.name+"|"+p.role));
        const toAdd = [];
        for (const p of parsed){
          const key = p.name+"|"+p.role;
          if (!namesSet.has(key)){
            toAdd.push({ id:newId(), name:p.name, role:p.role, rating:Number(p.rating||7) });
          }
        }
        return { ...prev, players: [...prev.players, ...toAdd] };
      });
      alert("הייבוא הושלם (התווספו רק מי שלא קיימים).");
    }
  };

  const exportPlayers = () => {
    const rows = [["name","role","rating"], ...data.players.map(p=>[p.name,p.role,p.rating])];
    const csv = rows.map(r=>r.map(x=>String(x).replace(/"/g,'""')).map(x=>`"${x}"`).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "players.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /** ---------- UI קטנים ---------- */
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

  /** ---------- טאבים ---------- */
  const PlayersTab = () => {
    const [pasteText, setPasteText] = useState("");
    const fileRef = useState(null)[0];

    const handleFile = (e, mode) => {
      const f = e.target.files?.[0];
      if (!f) return;
      importPlayers({ mode, fromFile: f });
      e.target.value = "";
    };
    const handlePasteImport = (mode) => importPlayers({ mode, pastedText: pasteText });

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
            <Field label="ציון">
              <select value={rating} onChange={e=>setRating(e.target.value)} style={{minWidth:120}}>
                <option value="" disabled>בחר</option>
                {[5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10].map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <button className="btn-primary" onClick={addPlayer}>הוסף</button>
          </div>
        </Card>

        <Card title="ייבוא/ייצוא שחקנים">
          <div className="row">
            <span className="badge">קבצים נתמכים: JSON / CSV / TXT</span>
            <button onClick={exportPlayers}>ייצוא CSV</button>
          </div>
          <hr/>
          <div className="row">
            <Field label="ייבוא מקובץ">
              <input type="file" accept=".json,.csv,.txt" onChange={(e)=>handleFile(e,"add")} />
            </Field>
            <button onClick={()=>fileRef?.click} style={{display:"none"}}>בחר קובץ</button>
            <button onClick={(e)=>{const inp=e.target.previousElementSibling?.querySelector('input'); inp?.click();}} style={{display:"none"}} />
            <button onClick={()=>alert("בחר קובץ ולמטה תוכל גם 'החלפה מלאה'")}>?</button>
            <span className="muted">ברירת מחדל: הוספה (מתעלם מכפילויות לפי שם+תפקיד)</span>
            <button onClick={(e)=>{
              const input = e.currentTarget.parentElement.querySelector('input[type=file]');
              input.onchange = (ev)=>handleFile(ev,"replace");
              input.click();
            }}>ייבוא "החלפה מלאה"</button>
          </div>
          <div className="row" style={{alignItems:"stretch"}}>
            <Field label="או הדבקה חופשית (שם, תפקיד, ציון בכל שורה)">
              <textarea rows={5} placeholder={`דוגמאות:
Lionel Messi, FW, 9.5
איתן לוי; הגנה; 7.5
{"name":"אבי","role":"MF","rating":8}
[{"name":"דני","role":"FW","rating":8.5}]`} value={pasteText} onChange={e=>setPasteText(e.target.value)} />
            </Field>
          </div>
          <div className="row">
            <button onClick={()=>handlePasteImport("add")} className="btn-primary">ייבוא מהדבקה (הוספה)</button>
            <button onClick={()=>handlePasteImport("replace")}>ייבוא מהדבקה (החלפה מלאה)</button>
          </div>
        </Card>

        <Card title={`רשימת שחקנים (${data.players.length})`}>
          {data.players.length===0 ? (
            <p className="muted">אין שחקנים עדיין.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>שם</th><th>תפקיד</th><th>ציון</th><th></th></tr>
              </thead>
              <tbody>
                {[...data.players].sort((a,b)=>a.name.localeCompare(b.name,"he")).map(p=>(
                  <tr key={p.id}>
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
                        {[5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10].map(n=><option key={n} value={n}>{n}</option>)}
                      </select>
                    </td>
                    <td><button onClick={()=>removePlayer(p.id)}>מחק</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
        <p className="muted">חלוקה על פי ציון ממוצע לסירוגין (מאזן רמות בסיסי).</p>
      </Card>

      {teams.length===0 ? (
        <Card><p className="muted">אין כוחות כרגע.</p></Card>
      ) : (
        teams.map((team,i)=>{
          const list = team.map(id=>playersById.get(id)).filter(Boolean);
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
      <div className="muted">תצוגה מעודכנת · ירוק־כהה · RTL · שמירה אוטומטית</div>

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
