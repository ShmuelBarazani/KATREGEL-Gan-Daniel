// src/TeamMaker.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import playersJson from "./players.json";

/* ======== UI base ======== */
const css = {
  page: { minHeight: "100vh", background: "#0b131f", color: "#dbeafe", margin: 0, fontFamily: "system-ui, Segoe UI, Arial, sans-serif", direction: "rtl" },
  wrap: { maxWidth: 1320, margin: "0 auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "#0f172a", border: "1px solid #1d2a4a", borderRadius: 12 },
  body: { padding: 12 },
  input: { background: "#0b1020", border: "1px solid #1f2b46", color: "#e5f0ff", borderRadius: 8, padding: "6px 8px" },
  select: { background: "#0b1020", border: "1px solid #1f2b46", color: "#e5f0ff", borderRadius: 8, padding: "6px 8px" },
  btn: { background: "#16a34a", color: "#fff", border: "1px solid #0e7a35", borderRadius: 10, padding: "8px 12px", cursor: "pointer" },
  btn2: { background: "rgba(34,197,94,.15)", color: "#86efac", border: "1px solid #136c38", borderRadius: 10, padding: "8px 12px", cursor: "pointer" },
  btnOutline: { background: "transparent", color: "#a7f3d0", border: "1px solid #136c38", borderRadius: 10, padding: "6px 10px", cursor: "pointer" },
  pill: { background: "transparent", color: "#93c5fd", border: "1px solid #1f2b46", borderRadius: 999, padding: "6px 10px", cursor: "pointer" },
  pillActive: { background: "#1d2a4a", color: "#93c5fd", border: "1px solid #33507c", borderRadius: 999, padding: "6px 10px", cursor: "pointer" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { position: "sticky", top: 0, zIndex: 5, background: "#134e4a", color: "#86efac", padding: 8, textAlign: "right", whiteSpace: "nowrap" },
  thSort: { cursor: "pointer", userSelect: "none" },
  td: { padding: 8, borderBottom: "1px solid #1f2b46", verticalAlign: "middle" },
  chips: { color: "#a7f3d0", fontSize: 12 },
  modalBg: { position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 },
  modal: { background: "#0f172a", border: "1px solid #1d2a4a", borderRadius: 14, width: "min(1100px,96vw)", maxHeight: "92vh", overflow: "auto", padding: 16, color: "#dbeafe" },
};
const scrollWrap = (h) => ({ maxHeight: h, overflowY: "auto", overflowX: "hidden", position: "relative" });

const POS = ["", "GK", "DF", "MF", "FW"];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const normalizeFromJson = (list) =>
  (list || []).map((p, i) => ({
    id: Number(p.id ?? i + 1),
    name: String(p.name ?? ""),
    r: clamp(Number(p.r ?? 5), 1, 10),
    pos: POS.includes(p.pos) ? p.pos : "",
    selected: p.selected !== false,
    prefer: Array.isArray(p.prefer) ? p.prefer.map(Number) : [],
    avoid: Array.isArray(p.avoid) ? p.avoid.map(Number) : [],
  }));

/* ניקוד + מחזור */
const resultPts = (r) => (r === "W" ? 3 : r === "D" ? 1 : 0);
const newSession = (teams) => ({
  id: Date.now(),
  date: new Date().toISOString().slice(0, 10),
  locked: false,
  teams: teams.map((t, i) => ({ name: `קבוצה ${i + 1}`, players: t.players.map((p) => ({ ...p })) })),
  results: { teamMatches: teams.map(() => []), goals: {} },
});

/* עזרה */
const rand = () => Math.random();
const shuffle = (arr) => { const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };

/* חלוקה מאוזנת עם אילוצי חייב/לא עם (V2) */
function makeTeamsV2(allPlayers, k) {
  const players = allPlayers.map(p => ({ ...p }));
  const idToIdx = new Map(players.map((p, i) => [p.id, i]));
  const parent = players.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const unite = (a,b)=>{a=find(a);b=find(b);if(a!==b)parent[Math.max(a,b)]=Math.min(a,b);};

  players.forEach((p,i)=>{
    const twoWay=new Set([...(p.prefer||[])]);
    players.forEach(q=>{ if((q.prefer||[]).includes(p.id)) twoWay.add(q.id); });
    twoWay.forEach(pid=>{ if(idToIdx.has(pid)) unite(i,idToIdx.get(pid)); });
  });

  const compMap=new Map();
  players.forEach((p,i)=>{ const r=find(i); if(!compMap.has(r)) compMap.set(r,[]); compMap.get(r).push(p); });

  let components=Array.from(compMap.values()).map(m=>({members:m,size:m.length,sum:m.reduce((s,x)=>s+(x.r||0),0),avg:m.reduce((s,x)=>s+(x.r||0),0)/Math.max(1,m.length)}));
  const totalR=players.reduce((s,p)=>s+(p.r||0),0), totalN=players.length, targetSum=totalR/k, targetSize=totalN/k;
  const avoidOf=new Map(players.map(p=>[p.id,new Set(p.avoid||[])]));

  const conflicts = (team,comp)=> comp.members.some(m=> team.players.some(tp=> (avoidOf.get(m.id)||new Set()).has(tp.id) || (avoidOf.get(tp.id)||new Set()).has(m.id)));

  components.sort((a,b)=> (b.avg-a.avg)||(b.sum-a.sum)); components=shuffle(components);
  const teams=Array.from({length:k},(_,i)=>({name:`קבוצה ${i+1}`,players:[],sum:0,size:0}));
  const cost=(t,c)=>{const s=t.sum+c.sum, z=t.size+c.size; return Math.abs(s-targetSum)+0.9*Math.abs(z-targetSize);};

  for(const comp of components){
    let best=-1,bestC=Infinity;
    for(let i=0;i<k;i++){ const t=teams[i]; if(conflicts(t,comp)) continue; const c=cost(t,comp); if(c<bestC||(Math.abs(c-bestC)<1e-6&&rand()<0.5)){bestC=c;best=i;} }
    if(best===-1) best=teams.map((t,i)=>[i,Math.abs((t.sum+comp.sum)-targetSum)]).sort((a,b)=>a[1]-b[1])[0][0];
    const t=teams[best]; teams[best]={...t,players:[...t.players,...comp.members],sum:t.sum+comp.sum,size:t.size+comp.size};
  }

  const teamObj=(ts)=>{const k=ts.length,av=ts.map(t=>t.players.length?t.sum/t.players.length:0),m=av.reduce((a,b)=>a+b,0)/k; const v=av.reduce((s,x)=>s+(x-m)*(x-m),0)/k; const sizeDev=ts.reduce((s,t)=>s+Math.abs(t.players.length-targetSize),0)/k; return v+0.15*sizeDev;};
  const compsInTeam=(ts)=>{const idToP=new Map(players.map(p=>[p.id,p])); const vis=new Set(); const gPref=new Map(players.map(p=>[p.id,new Set([...(p.prefer||[]),...players.filter(q=>(q.prefer||[]).includes(p.id)).map(q=>q.id)])])); const groups=ts.map(()=>[]); ts.forEach((t,ti)=>{ for(const p of t.players){ if(vis.has(p.id)) continue; const q=[p.id]; vis.add(p.id); for(let i=0;i<q.length;i++){const cur=q[i]; for(const nx of (gPref.get(cur)||new Set())) if(!vis.has(nx)&&t.players.some(pp=>pp.id===nx)){vis.add(nx); q.push(nx);} } const mem=q.map(id=>idToP.get(id)); groups[ti].push({members:mem,size:mem.length,sum:mem.reduce((s,x)=>s+(x.r||0),0)});} }); return groups; };
  const canAdd=(comp,t)=>!conflicts(t,comp);

  let improved=true,iter=0;
  while(improved && iter<160){
    improved=false; iter++;
    const base=teamObj(teams), groupsPerTeam=compsInTeam(teams), k=teams.length;

    for(let from=0;from<k;from++){
      for(const comp of shuffle(groupsPerTeam[from])){
        for(const to of shuffle([...Array(k).keys()].filter(x=>x!==from))){
          if(!canAdd(comp,teams[to])) continue;
          const newTs=teams.map((t,ti)=>{
            if(ti===from) return {...t,players:t.players.filter(p=>!comp.members.some(m=>m.id===p.id)),sum:t.sum-comp.sum,size:t.size-comp.size};
            if(ti===to)   return {...t,players:[...t.players,...comp.members],sum:t.sum+comp.sum,size:t.size+comp.size};
            return t;
          });
          if(teamObj(newTs)+1e-6<base){teams.splice(0,teams.length,...newTs); improved=true; break;}
        }
        if(improved) break;
      }
      if(improved) break;
    }

    if(improved) continue;

    const base2=teamObj(teams);
    outer: for(let a=0;a<k;a++) for(let b=a+1;b<k;b++){
      const AA=shuffle(compsInTeam(teams)[a]), BB=shuffle(compsInTeam(teams)[b]);
      for(const ca of AA) for(const cb of BB){
        const Aok=canAdd(ca,{...teams[b],players:teams[b].players.filter(p=>!cb.members.some(m=>m.id===p.id))});
        const Bok=canAdd(cb,{...teams[a],players:teams[a].players.filter(p=>!ca.members.some(m=>m.id===p.id))});
        if(!Aok||!Bok) continue;
        const newTs=teams.map((t,ti)=>{
          if(ti===a) return {...t,players:[...t.players.filter(p=>!ca.members.some(m=>m.id===p.id)),...cb.members],sum:t.sum-ca.sum+cb.sum,size:t.size-ca.size+cb.size};
          if(ti===b) return {...t,players:[...t.players.filter(p=>!cb.members.some(m=>m.id===p.id)),...ca.members],sum:t.sum-cb.sum+ca.sum,size:t.size-cb.size+ca.size};
          return t;
        });
        if(teamObj(newTs)+1e-6<base2){teams.splice(0,teams.length,...newTs); improved=true; break outer;}
      }
    }
  }

  teams.forEach(t=>{ t.players.sort((a,b)=>b.r-a.r); t.sum=t.players.reduce((s,x)=>s+(x.r||0),0); t.size=t.players.length; });
  return teams.map(({name,players})=>({name,players}));
}

/* fallback פשוט */
function splitTeamsSimple(players, k) {
  const sizes = Array.from({ length: k }, () => 0);
  const teams = Array.from({ length: k }, (_, i) => ({ name: `קבוצה ${i + 1}`, players: [] }));
  const sorted = [...players].sort((a, b) => b.r - a.r);
  for (const p of sorted) { let j=0; for(let i=1;i<k;i++) if(sizes[i]<sizes[j]) j=i; sizes[j]++; teams[j].players.push(p); }
  return teams;
}

export default function TeamMaker() {
  const [tab, setTab] = useState("teams");

  /* שחקנים */
  const [players, setPlayers] = useState(() => {
    const s = localStorage.getItem("tm_players_v1");
    if (s) try { return normalizeFromJson(JSON.parse(s)); } catch {}
    return normalizeFromJson(playersJson);
  });
  useEffect(()=>localStorage.setItem("tm_players_v1", JSON.stringify(players)),[players]);

  /* מחזורים */
  const [sessions, setSessions] = useState(() => {
    const s = localStorage.getItem("tm_sessions_v1");
    if (s) try { return JSON.parse(s); } catch {}
    return [];
  });
  useEffect(()=>localStorage.setItem("tm_sessions_v1", JSON.stringify(sessions)),[sessions]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const selectedSession = useMemo(()=> sessions.find(s=>s.id===selectedSessionId) || null,[sessions,selectedSessionId]);

  /* כוחות */
  const [teamsNum, setTeamsNum] = useState(4);
  const [currentTeams, setCurrentTeams] = useState([]);
  const [pool, setPool] = useState([]);

  /* הדפסה */
  const [printOpen, setPrintOpen] = useState(false);
  const [showRatings, setShowRatings] = useState(true);

  /* יצירת/שמירת כוחות */
  const buildTeams = () => {
    const poolPlayers = players.filter(p=>p.selected);
    if (poolPlayers.length < teamsNum) return alert("מס' השחקנים קטן ממס' הקבוצות");
    let t; try { t = makeTeamsV2(poolPlayers, teamsNum); } catch { t = splitTeamsSimple(poolPlayers, teamsNum); }
    setCurrentTeams(t); setPool([]); setTab("teams");
  };
  const saveSession = () => {
    let t=currentTeams;
    if(!t.length){ const poolPlayers=players.filter(p=>p.selected); if(poolPlayers.length<teamsNum) return alert("אין קבוצות לשמירה"); t=makeTeamsV2(poolPlayers,teamsNum); }
    const s=newSession(t); setSessions(prev=>[s,...prev]); setSelectedSessionId(s.id); setTab("ranking");
  };

  /* DnD */
  const onDragStart = (e) => { const ds=e.currentTarget.dataset; e.dataTransfer.setData("text/plain", JSON.stringify(ds)); e.dataTransfer.effectAllowed="move"; };
  const allowDrop = (e) => { e.preventDefault(); e.dataTransfer.dropEffect="move"; };
  const movePlayer = ({ from, fromTeam, pid }, { to, toTeam }) => {
    setCurrentTeams(prev=>{
      let teams=prev.map(t=>({ ...t, players:[...t.players] })); let pObj=null;
      if(from==="pool"){ const i=pool.findIndex(p=>p.id===pid); if(i===-1) return prev; pObj=pool[i]; setPool(old=>old.filter(p=>p.id!==pid)); }
      else { const i=teams[fromTeam].players.findIndex(p=>p.id===pid); if(i===-1) return prev; pObj=teams[fromTeam].players[i]; teams[fromTeam].players.splice(i,1); }
      if(to==="pool"){ setPool(old=>[...old,pObj]); }
      else {
        const tgt=teams[toTeam];
        const conflict=tgt.players.some(x=>(x.avoid||[]).includes(pObj.id)||(pObj.avoid||[]).includes(x.id));
        if(conflict && !confirm('שיבוץ זה מפר את "לא עם". להמשיך?')) return prev;
        tgt.players.push(pObj); tgt.players.sort((a,b)=>b.r-a.r);
      }
      return teams;
    });
  };
  const onDrop = (e) => { e.preventDefault(); const src=JSON.parse(e.dataTransfer.getData("text/plain")||"{}"); const tgt=e.currentTarget.dataset;
    const payload={ from:src.from, fromTeam:Number(src.team??-1), pid:Number(src.pid) }; const target={ to:tgt.drop, toTeam:Number(tgt.team??-1) }; if(!payload.pid) return; movePlayer(payload,target); };

  /* דירוג */
  const [year,setYear]=useState(new Date().getFullYear());
  const [month,setMonth]=useState(new Date().getMonth()+1);
  const [bonuses,setBonuses]=useState(true);
  function pointsFor(s,pid){
    const team=s.teams.find(t=>t.players.some(p=>p.id===pid)); if(!team) return null;
    const tidx=s.teams.indexOf(team); const arr=s.results.teamMatches[tidx]||[]; const matches=arr.length; const goals=Number(s.results.goals?.[pid]||0);
    const pts=arr.reduce((a,r)=>a+resultPts(r),0)+goals; return { matches,goals,pts };
  }
  const boards=useMemo(()=>{
    const mKey=`${year}-${String(month).padStart(2,"0")}`, yKey=`${year}`; const by=new Map();
    sessions.forEach(s=>{
      const d=new Date(s.date); const mk=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; const yk=`${d.getFullYear()}`;
      s.teams.forEach(t=>t.players.forEach(pl=>{
        if(!by.has(pl.id)) by.set(pl.id,{id:pl.id,name:(players.find(p=>p.id===pl.id)||pl).name,M:{},Y:{}});
        const st=pointsFor(s,pl.id); if(!st) return;
        by.get(pl.id).M[mk]??={pts:0,goals:0,sessions:0,matches:0}; const m=by.get(pl.id).M[mk]; m.pts+=st.pts; m.goals+=st.goals; m.matches+=st.matches; m.sessions+=1;
        by.get(pl.id).Y[yk]??={pts:0,goals:0,sessions:0,matches:0}; const y=by.get(pl.id).Y[yk]; y.pts+=st.pts; y.goals+=st.goals; y.matches+=st.matches; y.sessions+=1;
      }));
    });
    let monthly=[]; by.forEach(r=>{ const m=r.M[mKey]; if(!m||!m.sessions) return; const avg=+(m.pts/Math.max(1,m.sessions)).toFixed(2); monthly.push({id:r.id,name:r.name,avg,apps:m.sessions,points:m.pts,goals:m.goals}); });
    monthly.sort((a,b)=>b.avg-a.avg||b.points-a.points); if(monthly.length&&bonuses) monthly[0].points+=10;
    let topGoalsMonthly=[]; by.forEach(r=>{const m=r.M[mKey]; if(m&&m.sessions>0) topGoalsMonthly.push({id:r.id,name:r.name,goals:m.goals});}); topGoalsMonthly.sort((a,b)=>b.goals-a.goals);
    let topGoalsYearly=[]; by.forEach(r=>{const y=r.Y[yKey]; if(y&&y.sessions>0) topGoalsYearly.push({id:r.id,name:r.name,goals:y.goals});}); topGoalsYearly.sort((a,b)=>b.goals-a.goals);
    return { monthly, topGoalsMonthly, topGoalsYearly };
  },[sessions,players,year,month,bonuses]);

  /* סרגל */
  const Nav = () => (<div style={{display:"flex",gap:8}}>
    <button style={tab==="players"?css.pillActive:css.pill} onClick={()=>setTab("players")}>שחקנים</button>
    <button style={tab==="teams"?css.pillActive:css.pill} onClick={()=>setTab("teams")}>כוחות</button>
    <button style={tab==="ranking"?css.pillActive:css.pill} onClick={()=>setTab("ranking")}>דירוג</button>
  </div>);
  const TopBar = () => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <h1 style={{ color:"#34d399", margin:0, fontWeight:800 }}>קטרגל גן-דניאל ⚽</h1>
      <Nav />
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        {tab!=="ranking" && <>
          <button style={css.btn} onClick={buildTeams}>עשה כוחות</button>
          <button style={css.btn2} onClick={saveSession}>קבע מחזור</button>
          <button style={css.btnOutline} onClick={()=>setShowRatings(v=>!v)}>{showRatings? "הסתר ציונים" : "הצג ציונים"}</button>
          <button
            style={css.btnOutline}
            onClick={()=>{
              if(!currentTeams.length){
                const poolPlayers=players.filter(p=>p.selected);
                if(poolPlayers.length<teamsNum){ alert("אין קבוצות מוצגות. צור כוחות קודם."); return; }
                try{ setCurrentTeams(makeTeamsV2(poolPlayers,teamsNum)); } catch { setCurrentTeams(splitTeamsSimple(poolPlayers,teamsNum)); }
              }
              setPrintOpen(true);
            }}
          >תצוגת הדפסה</button>
          <div style={{ display:"flex", gap:6, alignItems:"center", background:"#0f172a", border:"1px solid #1d2a4a", padding:"6px 8px", borderRadius:10 }}>
            <span style={{ fontSize:13 }}>מס' קבוצות</span>
            <input style={{ ...css.input, width:70 }} type="number" min={2} max={12} value={teamsNum} onChange={(e)=> setTeamsNum(clamp(+e.target.value||2,2,12))} />
          </div>
        </>}
        {tab==="ranking" && (
          <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:13 }}>
            <input type="checkbox" checked={bonuses} onChange={(e)=>setBonuses(e.target.checked)} /> עם בונוסים
          </label>
        )}
      </div>
    </div>
  );

  /* עזרי שמות */
  const namesById = useMemo(()=>{ const m=new Map(); players.forEach(p=>m.set(p.id,p.name)); return m; },[players]);
  const labelList = (ids) => { if(!ids||!ids.length) return "—"; const n=ids.map(id=>namesById.get(id)||id).slice(0,2).join(", "); return ids.length>2?`${n} +${ids.length-2}`:n; };

  /* מודל שיוכים */
  const [linksEditor,setLinksEditor]=useState(null);
  const LinksModal=()=>{ if(!linksEditor) return null; const pid=linksEditor.id; const others=players.filter(x=>x.id!==pid);
    return (<div style={css.modalBg} onMouseDown={()=>setLinksEditor(null)}>
      <div style={css.modal} onMouseDown={(e)=>e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <h3 style={{ margin:0, color:"#6ee7b7" }}>שיוך שחקנים</h3>
          <div style={{ display:"flex", gap:8 }}>
            <button style={css.btn2} onClick={()=>setLinksEditor(null)}>סגור</button>
            <button style={css.btn} onClick={()=>{ const {id,prefer,avoid}=linksEditor; setPlayers(ps=>ps.map(p=>p.id===id?{...p,prefer,avoid}:p)); setLinksEditor(null); }}>שמור</button>
          </div>
        </div>
        <div style={{ display:"grid", gap:16, gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))" }}>
          <div><div style={{ fontWeight:600, color:"#a7f3d0", marginBottom:6 }}>חייב לשחק עם</div>
            <select multiple style={{ ...css.select, width:"100%", height:220 }} value={linksEditor.prefer}
              onChange={(e)=> setLinksEditor({...linksEditor, prefer: Array.from(e.target.selectedOptions).map(o=> Number(o.value))})}>
              {others.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div><div style={{ fontWeight:600, color:"#a7f3ד0", marginBottom:6 }}>לא לשחק עם</div>
            <select multiple style={{ ...css.select, width:"100%", height:220 }} value={linksEditor.avoid}
              onChange={(e)=> setLinksEditor({...linksEditor, avoid: Array.from(e.target.selectedOptions).map(o=> Number(o.value))})}>
              {others.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>);
  };

  /* טבלת שחקנים + מיון */
  const playersScrollRef=useRef(null);
  const nameRefs=useRef(new Map());
  const [sort,setSort]=useState({key:"name",dir:"asc"});
  const sortIcon=(k)=> sort.key!==k?" ":(sort.dir==="asc"?" ▲":" ▼");
  const toggleSort=(k)=> setSort(s=> s.key===k?({key:k,dir:s.dir==="asc"?"desc":"asc"}):({key:k,dir:"asc"}));
  const getVal=(p,k)=> (k==="name"?p.name||"":k==="pos"?p.pos||"":k==="r"?Number(p.r||0):k==="selected"?(p.selected?1:0):"");
  const sortedPlayers=useMemo(()=>{ const arr=[...players]; const dir=sort.dir==="asc"?1:-1; return arr.sort((a,b)=>{const va=getVal(a,sort.key),vb=getVal(b,sort.key); if(typeof va==="number"||typeof vb==="number") return (va-vb)*dir; return String(va).localeCompare(String(vb),"he")*dir;}); },[players,sort]);
  const tableHeightByTab = tab==="teams" ? "38vh" : "calc(100vh - 220px)";
  const PlayersEditor=()=> {
    const update=(id,field,value,sel)=>{ const sc=playersScrollRef.current?.scrollTop??0; setPlayers(ps=>ps.map(p=>p.id===id?{...p,[field]:value}:p));
      requestAnimationFrame(()=>{ if(playersScrollRef.current) playersScrollRef.current.scrollTop=sc; const input=nameRefs.current.get(id); if(input&&document.activeElement!==input) input.focus({preventScroll:true}); if(input&&sel){try{input.setSelectionRange(sel.start,sel.end);}catch{}} });
    };
    const remove=(id)=>setPlayers(ps=>ps.filter(p=>p.id!==id));
    const add=()=>{ const nid=players.reduce((m,p)=>Math.max(m,p.id),0)+1; setPlayers(ps=>[...ps,{id:nid,name:"חדש",r:5,pos:"",selected:true,prefer:[],avoid:[]}]); requestAnimationFrame(()=>{ nameRefs.current.get(nid)?.focus({preventScroll:true}); playersScrollRef.current && (playersScrollRef.current.scrollTop=playersScrollRef.current.scrollHeight); }); };
    return (<div style={css.card}><div style={css.body}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <h3 style={{ margin:0, color:"#6ee7b7" }}>שחקנים</h3><button style={css.btn} onClick={add}>הוסף שחקן</button>
      </div>
      <div ref={playersScrollRef} style={scrollWrap(tableHeightByTab)}>
        <table style={css.table}>
          <thead><tr>
            <th style={{ ...css.th, ...css.thSort }} onClick={()=>toggleSort("selected")}>משחק?{sortIcon("selected")}</th>
            <th style={{ ...css.th, width:36 }} title="גרירה">⋮⋮</th>
            <th style={{ ...css.th, ...css.thSort, width:220 }} onClick={()=>toggleSort("name")}>שם{sortIcon("name")}</th>
            <th style={{ ...css.th, ...css.thSort }} onClick={()=>toggleSort("pos")}>עמדה{sortIcon("pos")}</th>
            <th style={{ ...css.th, ...css.thSort }} onClick={()=>toggleSort("r")}>ציון{sortIcon("r")}</th>
            <th style={css.th}>חייב עם</th><th style={css.th}>לא עם</th><th style={css.th}></th>
          </tr></thead>
          <tbody>
            {sortedPlayers.map(p=>(
              <tr key={p.id}>
                <td style={css.td}><input type="checkbox" checked={p.selected} onChange={e=>update(p.id,"selected",e.target.checked)} /></td>
                <td style={css.td}><span draggable onDragStart={onDragStart} data-from="pool" data-pid={p.id} style={{ cursor:"grab", userSelect:"none" }} title="גרור אל הקבוצות">⋮⋮</span></td>
                <td style={css.td}><input ref={el=>{if(el) nameRefs.current.set(p.id,el);}} style={{ ...css.input, width:210 }} value={p.name}
                  onChange={e=>{ const start=e.target.selectionStart??e.target.value.length; const end=e.target.selectionEnd??e.target.value.length; update(p.id,"name",e.target.value,{start,end}); }} /></td>
                <td style={css.td}><select style={css.select} value={p.pos} onChange={e=>update(p.id,"pos",e.target.value)}>{POS.map(x=><option key={x} value={x}>{x||"(ללא)"}</option>)}</select></td>
                <td style={css.td}><input style={{ ...css.input, width:70 }} type="number" min={1} max={10} value={p.r} onChange={e=>update(p.id,"r",clamp(+e.target.value||5,1,10))} /></td>
                <td style={css.td}><span style={css.chips} title={(p.prefer||[]).map(id=>namesById.get(id)).join(", ")||""}>{labelList(p.prefer||[])}</span>
                  <button style={{ ...css.btn2, marginInlineStart: 8 }} onClick={()=> setLinksEditor({ id:p.id, prefer:p.prefer||[], avoid:p.avoid||[] })}>ערוך</button></td>
                <td style={css.td}><span style={css.chips} title={(p.avoid||[]).map(id=>namesById.get(id)).join(", ")||""}>{labelList(p.avoid||[])}</span>
                  <button style={{ ...css.btn2, marginInlineStart: 8 }} onClick={()=> setLinksEditor({ id:p.id, prefer:p.prefer||[], avoid:p.avoid||[] })}>ערוך</button></td>
                <td style={css.td}><button style={css.btnOutline} onClick={()=>remove(p.id)}>מחק</button></td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div></div>);
  };

  /* אזור הקבוצות */
  const TeamsZone=()=>{ const grid={ display:"grid", gap:12, gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))" };
    return (<div style={css.card}><div style={css.body}>
      <h3 style={{ margin:"0 0 8px 0", color:"#6ee7b7" }}>קבוצות למחזור</h3>
      <div onDragOver={allowDrop} onDrop={onDrop} data-drop="pool" style={{ border:"1px dashed #26406d", borderRadius:10, padding:8, marginBottom:12, color:"#93c5fd", fontSize:13 }}>גרור שחקן מהטבלה אל קבוצה; לגרירה החוצה גרור לכאן (מאגר)</div>
      {currentTeams.length===0 ? (<div style={{ opacity:.75 }}>עוד לא נוצרו כוחות. לחץ/י <b>עשה כוחות</b> למעלה.</div>) :
        (<div style={grid}>
          {currentTeams.map((t,idx)=>{ const total=t.players.reduce((s,x)=>s+(x.r||0),0); const avg=(total/Math.max(1,t.players.length)).toFixed(2);
            return (<div key={idx} onDragOver={allowDrop} onDrop={onDrop} data-drop="team" data-team={idx} style={{ border:"1px solid #1d2a4a", borderRadius:12, padding:12, minHeight:120 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                <h4 style={{ margin:0, color:"#6ee7b7" }}>{t.name}</h4>
                <div style={{ fontSize:12, color:"#a7f3d0" }}>סכ"ה {total} | ממוצע {avg}</div>
              </div>
              <ul style={{ listStyle:"none", padding:0, margin:0 }}>
                {t.players.map(p=>(
                  <li key={p.id} style={{ display:"flex", gap:6, alignItems:"center", padding:"4px 0" }}>
                    <span draggable onDragStart={onDragStart} data-from="team" data-team={idx} data-pid={p.id} style={{ cursor:"grab", userSelect:"none" }} title="גרור לקבוצה אחרת או למאגר">⋮⋮</span>
                    <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {showRatings ? `${p.name} (${p.pos || "-"}) – ${p.r}` : `${p.name}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>);
          })}
        </div>)}
    </div></div>);
  };

  /* === תצוגת הדפסה === */
  const SquareRow = ({ count=6, size=22, border="#000" }) => (
    <div style={{ display:"grid", gridTemplateColumns:`repeat(${count}, ${size}px)`, gap:8 }}>
      {Array.from({length:count}).map((_,i)=>(
        <div key={i} style={{ width:size, height:size, border:`1px solid ${border}`, borderRadius:4, background:"#fff" }} />
      ))}
    </div>
  );

  const PrintPreview = () => {
    if (!printOpen) return null;

    const teamsCount = currentTeams.length || 0;
    const cols = teamsCount >= 5 ? 3 : 2;        // 3×2 עבור 5–6 קבוצות, אחרת 2×2
    const boxSize = teamsCount >= 5 ? 18 : 22;   // משבצות קטנות יותר כשיש הרבה
    const fontBase = teamsCount >= 5 ? 12.5 : 14;

    return (
      <div style={css.modalBg} onMouseDown={()=>setPrintOpen(false)}>
        <div style={css.modal} onMouseDown={(e)=>e.stopPropagation()}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <h3 style={{ margin:0, color:"#6ee7ב7" }}>תצוגת הדפסה</h3>
            <div style={{ display:"flex", gap:8 }}>
              <button style={css.btnOutline} onClick={()=>setPrintOpen(false)}>סגור</button>
              <button style={css.btn} onClick={()=>window.print()}>ייצוא / PDF הדפס</button>
            </div>
          </div>

          {currentTeams.length===0 ? (
            <div style={{ opacity:.75 }}>אין כוחות להצגה. צור כוחות ואז פתח תצוגת הדפסה.</div>
          ) : (
            <div
              id="print-root"
              style={{
                display:"grid",
                gridTemplateColumns:`repeat(${cols}, 1fr)`,
                gap:12,
                padding:8,
                background:"#fff",
                color:"#000",
                borderRadius:8,
                fontSize:fontBase
              }}
            >
              {currentTeams.map((t, idx) => (
                <div key={idx} style={{ border:"1px solid #000", borderRadius:8, padding:10, background:"#fff", breakInside:"avoid" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, color:"#000" }}>
                    <h4 style={{ margin:0, color:"#000" }}>{t.name}</h4>
                    <span style={{ fontSize:12, color:"#000" }}>תאריך: {new Date().toISOString().slice(0,10)}</span>
                  </div>

                  <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:6 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign:"right", padding:"4px", border:"1px solid #000", color:"#000" }}>שחקן</th>
                        <th style={{ textAlign:"right", padding:"4px", border:"1px solid #000", color:"#000" }}>שערים</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.players.map(p=>(
                        <tr key={p.id}>
                          <td style={{ padding:"4px", border:"1px solid #000", color:"#000" }}>{p.name}</td>
                          <td style={{ padding:"4px", border:"1px solid #000" }}>
                            <SquareRow count={6} size={boxSize} border="#000" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {["ניצחון","תיקו","הפסד"].map(lbl=>(
                    <div key={lbl} style={{ display:"grid", gridTemplateColumns:"100px 1fr", alignItems:"center", gap:8, color:"#000", marginTop:4 }}>
                      <div>{lbl}</div>
                      <SquareRow count={6} size={boxSize} border="#000" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CSS הדפסה — עמוד אחד, Landscape, שחור בלבד, בלי להסתיר את ה־print-root */}
        <style>{`
          @media print {
            @page { size: A4 landscape; margin: 8mm; }
            html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff !important; }

            /* הסתרה ב-visibility, לא display */
            body * { visibility: hidden !important; }
            #print-root, #print-root * { visibility: visible !important; }

            /* מציבים את אזור ההדפסה למעלה כדי שלא ייחתך */
            #print-root { position: absolute !important; top: 0; right: 0; left: 0; width: 100% !important; }

            /* שולחנות וקווים שחורים */
            #print-root table { border-collapse: collapse !important; width: 100% !important; }
            #print-root th, #print-root td { border: 1px solid #000 !important; color: #000 !important; }

            /* מניעת שבירות */
            #print-root > * { break-inside: avoid !important; page-break-inside: avoid !important; }
          }
        `}</style>
      </div>
    );
  };

  /* ====== דשבורד דירוג (ללא שינויי פונקציה) ====== */
  const SavedSessionsPanel = () => (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {sessions.length===0 ? <div style={{ opacity:.7 }}>אין מחזורים שמורים.</div> :
        sessions.map(s=>(
          <div key={s.id} style={{ border:"1px solid #1d2a4a", borderRadius:10, padding:8, background:selectedSessionId===s.id?"#0b1b2f":"transparent" }}>
            <div style={{ display:"flex", gap:8, justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ color:"#a7f3d0", fontSize:13 }}>{s.teams.length} קבוצות | {s.teams.reduce((n,t)=>n+t.players.length,0)} שחקנים</div>
              <div style={{ display:"flex", gap:6 }}>
                <button style={css.btnOutline} onClick={()=>setSessions(ps=>ps.map(x=>x.id===s.id?{...x,locked:!x.locked}:x))}>{s.locked?"פתח נעילה":"נעל"}</button>
                <button style={css.btnOutline} onClick={()=>{ setSessions(ps=>ps.filter(x=>x.id!==s.id)); if(selectedSessionId===s.id) setSelectedSessionId(null); }}>מחק</button>
              </div>
            </div>
            <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:6 }}>
              <button style={css.btn2} onClick={()=>setSelectedSessionId(s.id)}>פתח</button>
              <input style={css.input} type="date" value={s.date} onChange={(e)=>setSessions(ps=>ps.map(x=>x.id===s.id?{...x,date:e.target.value}:x))} disabled={s.locked}/>
            </div>
          </div>
        ))}
    </div>
  );
  const addMatch=(sid,tidx)=>setSessions(ps=>ps.map(s=>s.id!==sid?s:({...s,results:{...s.results,teamMatches:s.results.teamMatches.map((a,i)=>i===tidx?[...a,"W"]:a)}})));
  const updMatch=(sid,tidx,idx,val)=>setSessions(ps=>ps.map(s=>s.id!==sid?s:({...s,results:{...s.results,teamMatches:s.results.teamMatches.map((a,i)=>i===tidx?a.map((x,j)=>j===idx?val:x):a)}})));
  const rmMatch=(sid,tidx,idx)=>setSessions(ps=>ps.map(s=>s.id!==sid?s:({...s,results:{...s.results,teamMatches:s.results.teamMatches.map((a,i)=>i===tidx?a.filter((_,j)=>j!==idx):a)}})));
  const setGoals=(sid,pid,val)=>setSessions(ps=>ps.map(s=>s.id!==sid?s:({...s,results:{...s.results,goals:{...s.results.goals,[pid]:clamp(+val||0,0,999)}}})));

  const ResultsPanel=()=> selectedSession ? (
    <div style={{ ...scrollWrap("38vh") }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:10 }}>
        {selectedSession.teams.map((t,idx)=>{ const arr=selectedSession.results.teamMatches[idx]||[]; const sum=arr.reduce((s,r)=>s+resultPts(r),0);
          return (<div key={idx} style={{ border:"1px solid #1d2a4a", borderRadius:10, padding:10 }}>
            <div style={{ fontWeight:700, color:"#a7f3d0", marginBottom:6 }}>{t.name}</div>
            {arr.map((r,j)=>(
              <div key={j} style={{ display:"flex", gap:6, alignItems:"center", marginBottom:6 }}>
                <select style={css.select} value={r} onChange={(e)=>updMatch(selectedSession.id,idx,j,e.target.value)} disabled={selectedSession.locked}>
                  <option value="W">ניצחון</option><option value="D">תיקו</option><option value="L">הפסד</option>
                </select>
                <button style={css.btnOutline} onClick={()=>rmMatch(selectedSession.id,idx,j)} disabled={selectedSession.locked}>מחק</button>
              </div>
            ))}
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <button style={css.btn2} onClick={()=>addMatch(selectedSession.id,idx)} disabled={selectedSession.locked}>הוסף תוצאה</button>
              <span style={{ fontSize:12, color:"#aזf3d0" }}>נק': {sum}</span>
            </div>
          </div>);
        })}
      </div>
    </div>): <div style={{ opacity:.7 }}>בחר מחזור מהרשימה.</div>;

  const GoalsPanel=()=> selectedSession ? (
    <div style={scrollWrap("38vh")}>
      <table style={css.table}><thead><tr><th style={css.th}>שחקן</th><th style={css.th}>קבוצה</th><th style={css.th}>שערים</th></tr></thead>
        <tbody>{selectedSession.teams.flatMap(t=> t.players.map(p=>(
          <tr key={`${t.name}-${p.id}`}><td style={css.td}>{p.name}</td><td style={css.td}>{t.name}</td>
            <td style={css.td}><input type="number" min={0} style={{ ...css.input, width:"100%" }}
              value={selectedSession.results.goals?.[p.id]||0} onChange={(e)=>setGoals(selectedSession.id,p.id,e.target.value)} disabled={selectedSession.locked}/></td></tr>
        )))}</tbody>
      </table>
    </div>): <div style={{ opacity:.7 }}>בחר מחזור מהרשימה.</div>;

  const MonthlyChampionship=()=>(
    <div style={scrollWrap("38vh")}><table style={css.table}>
      <thead><tr><th style={css.th}>#</th><th style={css.th}>שחקן</th><th style={css.th}>ממוצע</th><th style={css.th}>מפגשים</th><th style={css.th}>נק'</th></tr></thead>
      <tbody>{boards.monthly.map((r,i)=>(<tr key={r.id}><td style={css.td}>{i+1}</td><td style={css.td}>{r.name}{i===0?" 👑":""}</td><td style={css.td}>{r.avg}</td><td style={css.td}>{r.apps}</td><td style={css.td}>{r.points}</td></tr>))}</tbody>
    </table></div>
  );
  const GoalsMonthly=()=>(
    <div style={scrollWrap("38vh")}><table style={css.table}>
      <thead><tr><th style={css.th}>#</th><th style={css.th}>שחקן</th><th style={css.th}>שערים</th></tr></thead>
      <tbody>{boards.topGoalsMonthly.map((r,i)=>(<tr key={r.id}><td style={css.td}>{i+1}</td><td style={css.td}>{r.name}</td><td style={css.td}>{r.goals}</td></tr>))}</tbody>
    </table></div>
  );
  const GoalsYearly=()=>(
    <div style={scrollWrap("38vh")}><table style={css.table}>
      <thead><tr><th style={css.th}>#</th><th style={css.th}>שחקן</th><th style={css.th}>שערים</th></tr></thead>
      <tbody>{boards.topGoalsYearly.map((r,i)=>(<tr key={r.id}><td style={css.td}>{i+1}</td><td style={css.td}>{r.name}</td><td style={css.td}>{r.goals}</td></tr>))}</tbody>
    </table></div>
  );

  /* ====== Views ====== */
  function RankingView() {
    return (
      <>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1.2fr 1fr", gap:12, alignItems:"stretch" }}>
          <div style={css.card}><div style={css.body}>
            <h3 style={{ margin:0, color:"#6ee7b7" }}>מחזורים שמורים</h3>
            <div style={{ marginTop:8, ...scrollWrap("38vh") }}><SavedSessionsPanel /></div>
          </div></div>

          <div style={css.card}>
            <div style={{ ...css.body, display:"flex", gap:8, alignItems:"center" }}>
              <h3 style={{ margin:0, color:"#6ee7b7" }}>תוצאות המחזור</h3>
              <span style={{ fontSize:13, color:"#a7f3d0" }}>תאריך:</span>
              <input type="date" style={css.input}
                     value={selectedSession?.date || ""} onChange={(e)=> selectedSession && setSessions(ps=>ps.map(x=>x.id===selectedSession.id?{...x,date:e.target.value}:x))}
                     disabled={selectedSession?.locked}/>
            </div>
            <div style={css.body}><ResultsPanel /></div>
          </div>

          <div style={css.card}><div style={css.body}><h3 style={{ margin:0, color:"#6ee7b7" }}>שערים למחזור</h3></div><div style={css.body}><GoalsPanel /></div></div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, alignItems:"stretch" }}>
          <div style={css.card}><div style={{ ...css.body, display:"flex", alignItems:"center", gap:8 }}>
            <h3 style={{ margin:0, color:"#6ee7b7" }}>אליפות החודש ({bonuses ? "כולל" : "ללא"} בונוסים)</h3>
            <select style={css.select} value={year} onChange={(e)=>setYear(+e.target.value)}>{Array.from({length:6},(_,i)=> new Date().getFullYear()-i).map(y=><option key={y} value={y}>{y}</option>)}</select>
            <select style={css.select} value={month} onChange={(e)=>setMonth(+e.target.value)}>{Array.from({length:12},(_,i)=> i+1).map(m=><option key={m} value={m}>{m}</option>)}</select>
            <label style={{ display:"flex", gap:6, alignItems:"center", marginInlineStart:"auto", fontSize:13 }}>
              <input type="checkbox" checked={bonuses} onChange={(e)=>setBonuses(e.target.checked)} /> בונוסים
            </label>
          </div>
          <div style={css.body}><MonthlyChampionship /></div></div>

          <div style={css.card}><div style={css.body}><h3 style={{ margin:0, color:"#6ee7b7" }}>מלך שערים — חודשי</h3></div><div style={css.body}><GoalsMonthly /></div></div>
          <div style={css.card}><div style={css.body}><h3 style={{ margin:0, color:"#6ee7b7" }}>מלך השערים — שנתי</h3></div><div style={css.body}><GoalsYearly /></div></div>
        </div>
      </>
    );
  }

  return (
    <div style={css.page}>
      <div style={css.wrap}>
        <TopBar />
        {tab==="players" && <PlayersEditor />}
        {tab==="teams"   && <><PlayersEditor /><TeamsZone /></>}
        {tab==="ranking" && <RankingView />}

        {/* מודלים */}
        <LinksModal />
        <PrintPreview />
      </div>
    </div>
  );
}
