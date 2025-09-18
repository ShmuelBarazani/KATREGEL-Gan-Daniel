import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/* ===== נתוני קבע ===== */
const LS_KEY = 'katregel_state_v2'
const POS = [ ['GK','שוער'], ['DF','הגנה'], ['MF','קישור'], ['FW','התקפה'] ]
const RATING_STEPS = Array.from({length:19}, (_,i)=> (1 + i*0.5)) // 1..10 בקפיצות 0.5

/* ===== כלי עזר ===== */
const uid = () => Math.random().toString(36).slice(2) + '-' + Date.now().toString(36)
const roleName = (code) => ({GK:'שוער',DF:'הגנה',MF:'קישור',FW:'התקפה'}[code]||code)
const normRole = (v)=>{const t=(v||'').toString().trim().toLowerCase(); if(['gk','ש','שוער'].includes(t))return 'GK'; if(['df','ה','הגנה','בלם','מגן'].includes(t))return 'DF'; if(['mf','ק','קישור','קשר'].includes(t))return 'MF'; if(['fw','ח','התקפה','חלוץ','כנף'].includes(t))return 'FW'; return ['GK','DF','MF','FW'].includes(v)?v:'MF'}

/* --- שמירת מיקום גלילה: ref + מפתח --- */
function useStickyScroll(key){
  const ref = useRef(null)
  useLayoutEffect(()=>{
    const el = ref.current; if(!el) return
    // שחזור גלילה
    const y = sessionStorage.getItem('scroll:'+key)
    if(y) el.scrollTop = parseInt(y,10)
    const onScroll = () => sessionStorage.setItem('scroll:'+key, String(el.scrollTop))
    el.addEventListener('scroll', onScroll)
    return ()=> el.removeEventListener('scroll', onScroll)
  },[key])
  return ref
}

/* פרסור שחקנים (תומך players.json שלך: id,name,pos,r,selected,prefer,avoid) */
function parsePlayersText(text){
  text=(text||'').trim(); if(!text) return []
  try{
    const arr=JSON.parse(text)
    if(Array.isArray(arr)) return arr.map(x=>({
      id: (x.id!=null? String(x.id): uid()),
      name: x.name||x.שם,
      role: normRole(x.role||x.תפקיד||x.pos),
      rating: Number(x.rating||x.ציון||x.r||7),
      selected: Boolean(x.selected),
      prefer: Array.isArray(x.prefer)? x.prefer.map(v=>String(v)):[],
      avoid: Array.isArray(x.avoid)? x.avoid.map(v=>String(v)):[],
    })).filter(p=>p.name)
  }catch{}
  // שורות/CSV
  const rows=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean); const out=[]
  for(const r of rows){
    const parts=r.split(/[\t,;|]/).map(s=>s.trim()).filter(Boolean)
    if(parts.length===1) out.push({id:uid(),name:parts[0],role:'MF',rating:7,selected:true,prefer:[],avoid:[]})
    else { const [nm,rl,rt]=parts; out.push({id:uid(),name:nm,role:normRole(rl),rating:Number(rt||7),selected:true,prefer:[],avoid:[]}) }
  }
  return out
}

/* ממיר prefer/avoid שמכילים מזהים לשמות בפועל */
function refsToNames(list){
  const id2name = new Map(list.map(p=>[String(p.id), p.name]))
  return list.map(p=>({
    ...p,
    prefer: (p.prefer||[]).map(x => id2name.get(String(x)) || String(x)),
    avoid:  (p.avoid ||[]).map(x => id2name.get(String(x)) || String(x)),
  }))
}

/* ===== אחסון מתמשך ===== */
function useStore(){
  const [state,setState]=useState(()=>{try{const raw=localStorage.getItem(LS_KEY);return raw?JSON.parse(raw):{players:[],sessions:[],results:{}}}catch{return {players:[],sessions:[],results:{}}}})
  useEffect(()=>{try{localStorage.setItem(LS_KEY,JSON.stringify(state))}catch{}},[state])
  return [state,setState]
}

/* ===== בניית כוחות מאוזנים עם אילוצים ===== */
function buildTeams(players, numTeams){
  const pool = players.filter(p=>p.selected)
  const maxPerTeam = Math.ceil(pool.length/numTeams)
  const teams = Array.from({length:numTeams},()=>({list:[], sum:0}))
  const totalAvg = pool.length? pool.reduce((s,x)=>s+x.rating,0)/pool.length : 0
  const violatesAvoid = (team,p)=> team.list.some(x=> x.avoid?.includes(p.name) || p.avoid?.includes(x.name))
  const preferSatisfied = (team,p)=> p.prefer?.length? team.list.some(x=> p.prefer.includes(x.name) ): true

  const sorted=[...pool].sort((a,b)=>b.rating-a.rating)
  for(const p of sorted){
    let bestIdx=-1, bestScore=Infinity
    for(let i=0;i<numTeams;i++){
      const t=teams[i]; if(t.list.length>=maxPerTeam) continue
      if(violatesAvoid(t,p)) continue
      const prefOK = preferSatisfied(t,p)
      const newAvg = (t.sum + p.rating)/(t.list.length+1)
      const balanceScore = Math.abs(newAvg - totalAvg) + t.list.length*0.01
      const score = (prefOK?0:1)*1000 + balanceScore
      if(score<bestScore){bestScore=score; bestIdx=i}
    }
    if(bestIdx<0){
      for(let i=0;i<numTeams;i++){
        const t=teams[i]; if(t.list.length>=maxPerTeam) continue
        if(!violatesAvoid(t,p)){ bestIdx=i; break }
      }
      if(bestIdx<0) bestIdx=0
    }
    teams[bestIdx].list.push(p); teams[bestIdx].sum+=p.rating
  }
  return teams.map(t=>t.list)
}

/* ====== האפליקציה ====== */
export default function App(){
  const [store,setStore]=useStore()
  const [tab,setTab]=useState('players')
  const [teams,setTeams]=useState([])
  const [numTeams,setNumTeams]=useState(4)
  const [hideRatings,setHideRatings]=useState(false)
  const [printMode,setPrintMode]=useState(false)

  // טעינה אוטומטית מה-public/players.json בפעם הראשונה
  useEffect(()=>{(async()=>{
    if(store.players.length>0) return
    try{
      const r=await fetch('/players.json',{cache:'no-store'})
      if(!r.ok) return
      const txt=await r.text()
      const parsed=refsToNames(parsePlayersText(txt))
      if(parsed.length) setStore(s=>({...s,players:parsed}))
    }catch{}
  })()},[])

  const playersById=useMemo(()=>new Map(store.players.map(p=>[String(p.id),p])),[store.players])

  /* -------- פעולות שחקנים -------- */
  const addPlayer=(p)=> setStore(s=>({...s,players:[...s.players,{id:uid(),selected:true,prefer:[],avoid:[],...p}]}))
  const removePlayer=(id)=> setStore(s=>({...s,players:s.players.filter(p=>String(p.id)!==String(id))}))
  const updatePlayer=(id,patch)=> setStore(s=>({...s,players:s.players.map(p=>String(p.id)===String(id)?{...p,...patch}:p)}))

  /* -------- כוחות ומחזורים -------- */
  const makeTeams=()=>{const t=buildTeams(store.players,numTeams); setTeams(t); setTab('teams')}
  const clearTeams=()=>setTeams([])
  const saveSession=()=>{
    if(teams.length===0){alert('עוד לא נוצרו כוחות'); return}
    const id=uid(); const date=new Date().toISOString()
    const sess={id,date, teams: teams.map(g=>g.map(p=>String(p.id))) }
    setStore(s=>({...s,sessions:[sess,...s.sessions]}))
    alert('המחזור נשמר. אפשר להזין תוצאות בלשונית "דירוג"')
  }

  /* -------- תוצאות ומדדים -------- */
  const [selectedSessionId,setSelectedSessionId]=useState('')
  const resultsFor = (sid)=> store.results[sid]||{}
  const setResult=(sid,pid,goals)=> setStore(s=>({...s,results:{...s.results,[sid]:{...resultsFor(sid), [pid]:goals}}}))

  const monthOptions = Array.from({length:12},(_,i)=>i+1)
  const [withBonus,setWithBonus]=useState(true)
  const [selMonth,setSelMonth]=useState(new Date().getMonth()+1)
  const [selYear,setSelYear]=useState(new Date().getFullYear())

  function goalsByRange({year,month}){
    const out=new Map()
    for(const sess of store.sessions){
      const d=new Date(sess.date)
      if((!year||d.getFullYear()===year) && (!month||d.getMonth()+1===month)){
        const r=store.results[sess.id]||{}
        for(const [pid,g] of Object.entries(r)){
          const name=playersById.get(String(pid))?.name||pid
          out.set(name,(out.get(name)||0)+Number(g||0))
        }
        if(withBonus){
          const arr=Object.entries(r).map(([pid,g])=>({pid, g:Number(g||0)})).sort((a,b)=>b.g-a.g)
          if(arr.length&&arr[0].g>0){
            const name=playersById.get(String(arr[0].pid))?.name||arr[0].pid
            out.set(name,(out.get(name)||0)+3)
          }
        }
      }
    }
    return [...out.entries()].map(([name,goals])=>({name,goals})).sort((a,b)=>b.goals-a.goals)
  }

  /* ====== UI ====== */
  return (
    <div className={printMode? 'print page':'page'}>
      {/* Appbar */}
      <div className="appbar">
        <div className="title">⚽ קטרגל – גן-דניאל</div>
        <div className="tabs">
          <button className={`tab ${tab==='players'?'active':''}`} onClick={()=>setTab('players')}>שחקנים</button>
          <button className={`tab ${tab==='teams'?'active':''}`} onClick={()=>setTab('teams')}>כוחות</button>
          <button className={`tab ${tab==='ranking'?'active':''}`} onClick={()=>setTab('ranking')}>דירוג</button>
        </div>
      </div>

      {/* Controls row */}
      <div className="controls" style={{marginBottom:12}}>
        <div className="row">
          <span className="badge" title="מס׳ קבוצות">{numTeams}</span>
          <button className="btn" onClick={()=>setNumTeams(n=>Math.max(2,n-1))}>−</button>
          <button className="btn" onClick={()=>setNumTeams(n=>Math.min(8,n+1))}>+</button>
        </div>
        <div className="switch"><input type="checkbox" checked={hideRatings} onChange={e=>setHideRatings(e.target.checked)} /> הסתר ציונים</div>
        <button className="btn" onClick={()=>setPrintMode(v=>!v)}>תצוגת הדפסה</button>
        <button className="btn" onClick={saveSession}>קבע מחזור</button>
        <button className="btn primary" onClick={makeTeams}>עשה כוחות</button>
      </div>

      {tab==='players' && <PlayersTab players={store.players} update={updatePlayer} remove={removePlayer} add={addPlayer} hideRatings={hideRatings} />}
      {tab==='teams'   && <TeamsTab teams={teams} clear={clearTeams} />}
      {tab==='ranking' && (
        <RankingTab
          sessions={store.sessions}
          selectedSessionId={selectedSessionId}
          setSelectedSessionId={setSelectedSessionId}
          results={store.results}
          setResult={setResult}
          monthOptions={monthOptions}
          selMonth={selMonth} setSelMonth={setSelMonth}
          selYear={selYear} setSelYear={setSelYear}
          withBonus={withBonus} setWithBonus={setWithBonus}
          goalsByRange={goalsByRange}
          playersById={playersById}
        />)}
      <div className="footer-note">שמירה: localStorage · טעינה ראשונה מ-public/players.json · גלילה נשמרת תמיד</div>
    </div>
  )
}

/* ===== רכיבי טאבים ===== */
function PlayersTab({players, update, remove, add, hideRatings}){
  const [editing,setEditing]=useState(null)   // עריכת prefer/avoid
  const [showAdd,setShowAdd]=useState(false)  // חלונית הוספת שחקן
  const [newPlayer,setNewPlayer]=useState({name:'',role:'DF',rating:7,selected:true})

  // שמירת מיקום גלילה ברשימת השחקנים
  const wrapRef = useStickyScroll('playersTable')

  // מפה id->שם כדי להציג שמות גם אם בקובץ היו מזהים
  const idByName = new Map(players.map(p=>[String(p.id), p.name]))

  const sorted=[...players].sort((a,b)=> a.name.localeCompare(b.name,'he'))

  return (
    <div className="card">
      <div className="row" style={{marginBottom:10}}>
        <button className="btn primary" onClick={()=>setShowAdd(true)}>הוסף שחקן</button>
      </div>

      {/* רשימה גבוהה עם גלילה שנשמרת */}
      <div className="tableWrap" ref={wrapRef}>
        <table className="table">
          <thead>
            <tr>
              <th style={{width:70}}>מחק</th>
              <th>לא עם</th>
              <th>חייב עם</th>
              {!hideRatings && <th style={{width:90}}>ציון</th>}
              <th style={{width:120}}>עמדה</th>
              <th>שם</th>
              <th style={{width:80}}>משחק?</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p=> {
              // המרת מזהים לשמות לתצוגה
              const preferNames = (p.prefer||[]).map(x => idByName.get(String(x)) || String(x))
              const avoidNames  = (p.avoid ||[]).map(x => idByName.get(String(x)) || String(x))
              return (
              <tr key={p.id}>
                <td><button className="btn danger" onClick={()=>remove(p.id)}>מחק</button></td>
                <td>
                  <div className="chips">
                    {avoidNames.map(n=> <span key={n} className="chip hollow">{n}</span>)}
                    <button className="btn mini" onClick={()=>setEditing({id:p.id,type:'avoid', value:avoidNames.join(', ')})}>ערוך</button>
                  </div>
                </td>
                <td>
                  <div className="chips">
                    {preferNames.map(n=> <span key={n} className="chip">{n}</span>)}
                    <button className="btn mini" onClick={()=>setEditing({id:p.id,type:'prefer', value:preferNames.join(', ')})}>ערוך</button>
                  </div>
                </td>
                {!hideRatings && (
                  <td>
                    <select className="mini" value={p.rating} onChange={e=>update(p.id,{rating:Number(e.target.value)})}>
                      {RATING_STEPS.map(n=> <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                )}
                <td>
                  <select className="mini" value={p.role} onChange={e=>update(p.id,{role:e.target.value})}>
                    {POS.map(([v,t])=> <option key={v} value={v}>{t}</option>)}
                  </select>
                </td>
                <td><input className="mini" value={p.name} onChange={e=>update(p.id,{name:e.target.value})}/></td>
                <td style={{textAlign:'center'}}><input type="checkbox" checked={!!p.selected} onChange={e=>update(p.id,{selected:e.target.checked})}/></td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* חלונית עריכת “חייב/לא עם” */}
      {editing && (
        <div className="modal" onClick={()=>setEditing(null)}>
          <div className="box" onClick={e=>e.stopPropagation()}>
            <h3>{editing.type==='prefer'? 'חייב עם':'לא עם'}</h3>
            <p className="footer-note">הפרד שמות בפסיקים, למשל: אבי, דני, רועי</p>
            <textarea value={editing.value} onChange={e=>setEditing(x=>({...x,value:e.target.value}))}></textarea>
            <div className="row" style={{marginTop:10}}>
              <button className="btn" onClick={()=>setEditing(null)}>בטל</button>
              <button className="btn primary" onClick={()=>{ const list=editing.value.split(',').map(s=>s.trim()).filter(Boolean); const patch={[editing.type]:list}; update(editing.id,patch); setEditing(null)}}>שמור</button>
            </div>
          </div>
        </div>
      )}

      {/* חלונית הוספת שחקן */}
      {showAdd && (
        <div className="modal" onClick={()=>setShowAdd(false)}>
          <div className="box" onClick={e=>e.stopPropagation()}>
            <h3>הוספת שחקן</h3>
            <div className="row">
              <input className="mini" placeholder="שם" value={newPlayer.name} onChange={e=>setNewPlayer(p=>({...p,name:e.target.value}))} />
              <select className="mini" value={newPlayer.role} onChange={e=>setNewPlayer(p=>({...p,role:e.target.value}))}>{POS.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>
              <select className="mini" value={newPlayer.rating} onChange={e=>setNewPlayer(p=>({...p,rating:Number(e.target.value)}))}>
                {RATING_STEPS.map(n=> <option key={n} value={n}>{n}</option>)}
              </select>
              <label className="switch"><input type="checkbox" checked={newPlayer.selected} onChange={e=>setNewPlayer(p=>({...p,selected:e.target.checked}))}/> משחק?</label>
            </div>
            <div className="row" style={{marginTop:10}}>
              <button className="btn" onClick={()=>setShowAdd(false)}>בטל</button>
              <button className="btn primary" onClick={()=>{
                if(!newPlayer.name.trim()) return alert('שם?')
                add(newPlayer); setNewPlayer({name:'',role:'DF',rating:7,selected:true}); setShowAdd(false)
              }}>שמור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TeamsTab({teams, clear}){
  const wrapRef = useStickyScroll('teamsWrap')
  if(!teams || teams.length===0) return <div className="card"><p className="footer-note">עוד לא נוצרו כוחות. לחץ "עשה כוחות" למעלה.</p></div>
  return (
    <div className="grid-2">
      <div className="tableWrap" ref={wrapRef} style={{gridColumn:'1 / -1'}}>
        {teams.map((team,idx)=>{
          const avg = team.length? (team.reduce((s,p)=>s+Number(p.rating),0)/team.length).toFixed(2):'—'
          return (
            <div key={idx} className="card" style={{marginBottom:10}}>
              <div className="section-title">קבוצה {idx+1} · ממוצע {avg}</div>
              {team.map(p=> (
                <div key={p.id} className="row" style={{justifyContent:'space-between'}}>
                  <span>• {p.name}</span>
                  <span className="footer-note">{roleName(p.role)} {!isNaN(p.rating)? `· ${p.rating}`:''}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      <div className="card"><button className="btn" onClick={clear}>נקה</button></div>
    </div>
  )
}

function RankingTab({sessions,selectedSessionId,setSelectedSessionId,results,setResult,monthOptions,selMonth,setSelMonth,selYear,setSelYear,withBonus,setWithBonus,goalsByRange,playersById}){
  const selected = sessions.find(s=>s.id===selectedSessionId)
  const wrapRef = useStickyScroll('rankingWrap')
  return (
    <div className="grid-2">
      <div className="card">
        <div className="section-title">תוצאות המחזור</div>
        <div className="row">
          <select value={selectedSessionId} onChange={e=>setSelectedSessionId(e.target.value)}>
            <option value="">בחר מחזור…</option>
            {sessions.map(s=>{const d=new Date(s.date); const label=d.toLocaleDateString('he-IL'); return <option key={s.id} value={s.id}>{label} · {s.teams.length} קבוצות</option>})}
          </select>
        </div>
        {!selected? <p className="footer-note">בחר מחזור מהרשימה כדי להזין תוצאות.</p> : (
          <div className="tableWrap" ref={wrapRef} style={{marginTop:10}}>
            {selected.teams.map((team,idx)=> (
              <div key={idx} className="card" style={{background:'#0d1b2a', marginBottom:10}}>
                <div className="section-title">קבוצה {idx+1}</div>
                <div className="row" style={{display:'grid', gridTemplateColumns:'1fr 120px', gap:8}}>
                  {team.map(pid=>{
                    const p=playersById.get(String(pid)); if(!p) return null
                    const val=results[selectedSessionId]?.[pid] ?? ''
                    return (<>
                      <div>• {p.name}</div>
                      <input className="mini" placeholder="שערים" value={val} onChange={e=>setResult(selectedSessionId, pid, Number(e.target.value||0))} />
                    </>)
                  })}
                </div>
              </div>
            ))}
            <p className="footer-note">הזנת שערים נשמרת אוטומטית.</p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">מלך השערים — חודשי</div>
        <div className="row">
          <label>חודש <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}>{monthOptions.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
          <label>שנה <input className="mini" type="number" value={selYear} onChange={e=>setSelYear(Number(e.target.value))} style={{width:100}}/></label>
          <label className="switch"><input type="checkbox" checked={withBonus} onChange={e=>setWithBonus(e.target.checked)}/> עם בונוסים</label>
        </div>
        <TopTable rows={goalsByRange({year:selYear,month:selMonth}).map((r,i)=>({rank:i+1,name:r.name,val:r.goals}))} valHeader="שערים"/>
      </div>

      <div className="card">
        <div className="section-title">מלך השערים — שנתי</div>
        <TopTable rows={goalsByRange({year:selYear,month:undefined}).map((r,i)=>({rank:i+1,name:r.name,val:r.goals}))} valHeader="שערים"/>
      </div>
    </div>
  )
}

function TopTable({rows,valHeader}){
  if(!rows.length) return <p className="footer-note">אין נתונים.</p>
  return (
    <table className="table">
      <thead><tr><th style={{width:50}}>#</th><th>שחקן</th><th style={{width:100}}>{valHeader}</th></tr></thead>
      <tbody>
        {rows.map(r=> <tr key={r.rank+r.name}><td>{r.rank}</td><td>{r.name}</td><td>{r.val}</td></tr>)}
      </tbody>
    </table>
  )
}
