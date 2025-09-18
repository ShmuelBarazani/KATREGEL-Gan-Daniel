import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/* ===== נתוני קבע ===== */
const LS_KEY = 'katregel_state_v7'
const POS = [ ['GK','שוער'], ['DF','הגנה'], ['MF','קישור'], ['FW','התקפה'] ]
const RATING_STEPS = Array.from({length:19}, (_,i)=> (1 + i*0.5)) // 1..10

/* ===== כלי עזר ===== */
const uid = () => Math.random().toString(36).slice(2) + '-' + Date.now().toString(36)
const roleName = (code) => ({GK:'שוער',DF:'הגנה',MF:'קישור',FW:'התקפה'}[code]||code)
const normRole = (v)=>{const t=(v||'').toString().trim().toLowerCase(); if(['gk','ש','שוער'].includes(t))return 'GK'; if(['df','ה','הגנה','בלם','מגן'].includes(t))return 'DF'; if(['mf','ק','קישור','קשר'].includes(t))return 'MF'; if(['fw','ח','התקפה','חלוץ','כנף'].includes(t))return 'FW'; return ['GK','DF','MF','FW'].includes(v)?v:'MF'}
const sortByDescRating = (arr)=> arr.sort((a,b)=> Number(b.rating||0)-Number(a.rating||0))

/* --- שמירת מיקום גלילה --- */
function useStickyScroll(key){
  const ref = useRef(null)
  useLayoutEffect(()=>{
    const el = ref.current; if(!el) return
    const y = sessionStorage.getItem('scroll:'+key)
    if(y) el.scrollTop = parseInt(y,10)
    const onScroll = () => sessionStorage.setItem('scroll:'+key, String(el.scrollTop))
    el.addEventListener('scroll', onScroll)
    return ()=> el.removeEventListener('scroll', onScroll)
  },[key])
  return ref
}

/* players.json / CSV */
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
  const rows=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean); const out=[]
  for(const r of rows){
    const parts=r.split(/[\t,;|]/).map(s=>s.trim()).filter(Boolean)
    if(parts.length===1) out.push({id:uid(),name:parts[0],role:'MF',rating:7,selected:true,prefer:[],avoid:[]})
    else { const [nm,rl,rt]=parts; out.push({id:uid(),name:nm,role:normRole(rl),rating:Number(rt||7),selected:true,prefer:[],avoid:[]}) }
  }
  return out
}
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

/* ===== בניית כוחות מאוזנים ===== */
function buildTeamsBalanced(players, numTeams){
  const pool = players.filter(p=>p.selected)
  const maxPerTeam = Math.ceil(pool.length/numTeams)
  const teams = Array.from({length:numTeams},()=>({list:[], sum:0}))
  const totalAvg = pool.length? pool.reduce((s,x)=>s+x.rating,0)/pool.length : 0
  const violatesAvoid = (team,p)=> team.list.some(x=> x.avoid?.includes(p.name) || p.avoid?.includes(x.name))
  const preferSatisfied = (team,p)=> p.prefer?.length? team.list.some(x=> p.prefer.includes(x.name) ): true
  const sorted=[...pool].sort((a,b)=> (b.rating + Math.random()*0.15) - (a.rating + Math.random()*0.15))
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
  return teams.map(t=> sortByDescRating(t.list))
}

/* ====== APP ====== */
export default function App(){
  const [store,setStore]=useStore()
  const [tab,setTab]=useState('teams')
  const [teams,setTeams]=useState([])
  const [numTeams,setNumTeams]=useState(4)
  const [hideTeamRatings,setHideTeamRatings]=useState(false) // משפיע רק על הקבוצות
  const [printOpen,setPrintOpen]=useState(false)

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

  const selectedCount = useMemo(()=> store.players.filter(p=>p.selected).length, [store.players])

  /* CRUD players */
  const addPlayer=(p)=> setStore(s=>({...s,players:[...s.players,{id:uid(),selected:true,prefer:[],avoid:[],...p}]}))
  const removePlayer=(id)=> setStore(s=>({...s,players:s.players.filter(p=>String(p.id)!==String(id))}))
  const updatePlayer=(id,patch)=> setStore(s=>({...s,players:s.players.map(p=>String(p.id)===String(id)?{...p,...patch}:p)}))

  /* Teams actions */
  const makeTeams=()=>{const t=buildTeamsBalanced(store.players,numTeams); setTeams(t); setTab('teams')}
  const clearTeams=()=>setTeams([])

  /* עדכון קבוצה + מיון פנימי לפי ציון יורד */
  const setTeamsSorted = (updater)=>{
    setTeams(prev=>{
      const next = typeof updater==='function'? updater(prev): updater
      return next.map(g=> sortByDescRating([...g]))
    })
  }

  return (
    <div className="page">
      <div className="appbar">
        <div className="title">⚽ קטרגל – גן-דניאל</div>
        <div className="tabs">
          <button className={`tab ${tab==='players'?'active':''}`} onClick={()=>setTab('players')}>שחקנים</button>
          <button className={`tab ${tab==='teams'?'active':''}`} onClick={()=>setTab('teams')}>כוחות</button>
        </div>
      </div>

      <div className="controls" style={{marginBottom:12}}>
        <div className="row">
          <span className="badge" title="מס׳ קבוצות">{numTeams}</span>
          <button className="btn" onClick={()=>setNumTeams(n=>Math.max(2,n-1))}>−</button>
          <button className="btn" onClick={()=>setNumTeams(n=>Math.min(8,n+1))}>+</button>
        </div>
        <div className="switch"><input type="checkbox" checked={hideTeamRatings} onChange={e=>setHideTeamRatings(e.target.checked)} /> הסתר ציונים (בקבוצות)</div>
        <button className="btn" onClick={clearTeams}>קבע מחזור</button>
        <button className="btn primary" onClick={makeTeams}>עשה כוחות</button>
        <span className="badge">מסומנים: {selectedCount}</span>
        <button className="btn" onClick={()=>setPrintOpen(true)}>תצוגת הדפסה / יצוא PDF</button>
      </div>

      {tab==='teams' && (
        <TeamsScreen
          players={store.players}
          update={updatePlayer}
          remove={removePlayer}
          add={addPlayer}
          teams={teams}
          setTeamsSorted={setTeamsSorted}
          hideTeamRatings={hideTeamRatings}
        />
      )}

      {tab==='players' && (
        <PlayersScreen
          players={store.players}
          update={updatePlayer}
          remove={removePlayer}
          add={addPlayer}
        />
      )}

      {printOpen && <PrintPreviewModal onClose={()=>setPrintOpen(false)} teams={teams} />}
    </div>
  )
}

/* =================== מסכי משנה =================== */

function PlayersScreen({players, update, remove, add}){
  const wrapRef = useStickyScroll('playersTable')
  const [showAdd,setShowAdd]=useState(false)
  const [newPlayer,setNewPlayer]=useState({name:'',role:'DF',rating:7,selected:true})

  /* מיון בכותרת */
  const [sortBy,setSortBy]=useState('name')
  const [dir,setDir]=useState('asc')

  const sorted = useMemo(()=>{
    const arr=[...players]
    const cmp = {
      name: (a,b)=> a.name.localeCompare(b.name,'he'),
      role: (a,b)=> roleName(a.role).localeCompare(roleName(b.role),'he'),
      rating: (a,b)=> a.rating-b.rating,
      selected: (a,b)=> Number(a.selected)-Number(b.selected),
      prefer: (a,b)=> (a.prefer?.length||0)-(b.prefer?.length||0),
      avoid:  (a,b)=> (a.avoid ?.length||0)-(b.avoid ?.length||0),
    }[sortBy] || ((a,b)=>0)
    arr.sort(cmp); if(dir==='desc') arr.reverse(); return arr
  },[players,sortBy,dir])

  const onSort = (col)=>{
    setSortBy(prev=>{
      if(prev===col){ setDir(d=> d==='asc' ? 'desc' : 'asc'); return prev }
      setDir('asc'); return col
    })
  }

  return (
    <div className="card">
      <div className="row" style={{marginBottom:10}}>
        <button className="btn primary" onClick={()=>setShowAdd(true)}>הוסף שחקן</button>
      </div>

      <div style={{maxHeight:'70vh', overflow:'auto'}} ref={wrapRef}>
        <PlayersTable
          players={sorted}
          update={update}
          remove={remove}
          hideRatings={false}           /* לא מסתירים ציונים בטבלה */
          showDragHandle={false}
          onDragStartRow={()=>{}}
          sortBy={sortBy}
          dir={dir}
          onSort={onSort}
        />
      </div>

      {showAdd && (
        <AddPlayerModal
          newPlayer={newPlayer}
          setNewPlayer={setNewPlayer}
          onCancel={()=>setShowAdd(false)}
          onSave={()=>{
            if(!newPlayer.name.trim()) return alert('שם?')
            add(newPlayer); setNewPlayer({name:'',role:'DF',rating:7,selected:true}); setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}

function TeamsScreen({players, update, remove, add, teams, setTeamsSorted, hideTeamRatings}){
  /* מיון רשימת השחקנים למטה */
  const [sortBy,setSortBy]=useState('name')
  const [dir,setDir]=useState('asc')

  const tableRef = useStickyScroll('teamsPlayersTable')
  const teamsRef = useStickyScroll('teamsGrid')

  const sortedList = useMemo(()=>{
    const arr=[...players]
    const cmp = {
      name: (a,b)=> a.name.localeCompare(b.name,'he'),
      role: (a,b)=> roleName(a.role).localeCompare(roleName(b.role),'he'),
      rating: (a,b)=> a.rating-b.rating,
      selected: (a,b)=> Number(a.selected)-Number(b.selected),
      prefer: (a,b)=> (a.prefer?.length||0)-(b.prefer?.length||0),
      avoid:  (a,b)=> (a.avoid ?.length||0)-(b.avoid ?.length||0),
    }[sortBy] || ((a,b)=>0)
    arr.sort(cmp); if(dir==='desc') arr.reverse(); return arr
  },[players,sortBy,dir])

  const handleSort = (col)=>{
    setSortBy(prev=>{
      if(prev===col){ setDir(d=> d==='asc' ? 'desc' : 'asc'); return prev }
      setDir('asc'); return col
    })
  }

  /* DnD */
  const onDragStartRow = (e, pid) => {
    e.dataTransfer.setData('application/json', JSON.stringify({pid, from:'list'}))
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add('over') }
  const onDragLeave = (e) => { e.currentTarget.classList.remove('over') }
  const dropToTeam = (e, targetIdx) => {
    e.preventDefault(); e.currentTarget.classList.remove('over')
    const data = JSON.parse(e.dataTransfer.getData('application/json')||'{}')
    if(!data.pid) return
    setTeamsSorted(prev=>{
      const clone = prev.map(t=>[...t])
      if(!clone[targetIdx].some(p=>String(p.id)===String(data.pid))){
        const obj = players.find(p=>String(p.id)===String(data.pid))
        if(obj) clone[targetIdx].push(obj)
      }
      if(typeof data.from==='number'){
        const i = clone[data.from].findIndex(p=>String(p.id)===String(data.pid))
        if(i>=0) clone[data.from].splice(i,1)
      }
      return clone
    })
  }
  const onDragStartFromTeam = (e, pid, fromIdx) => {
    e.dataTransfer.setData('application/json', JSON.stringify({pid, from:fromIdx}))
    e.dataTransfer.effectAllowed = 'move'
  }

  /* הוספה מהמסך */
  const [showAdd,setShowAdd]=useState(false)
  const [newPlayer,setNewPlayer]=useState({name:'',role:'DF',rating:7,selected:true})

  return (
    <div className="card">
      {/* קבוצות למעלה */}
      <div className="teamsTop" ref={teamsRef}>
        <div className="teamsGrid">
          {teams.length===0 && <p className="footer-note" style={{gridColumn:'1 / -1'}}>עוד לא נוצרו כוחות. לחץ “עשה כוחות”.</p>}
          {teams.map((team,idx)=>{
            const sum = team.reduce((s,p)=>s+Number(p.rating||0),0)
            const avg = team.length? (sum/team.length).toFixed(2):'—'
            return (
              <div key={idx} className="teamCard dropzone"
                   onDragOver={onDragOver} onDragLeave={onDragLeave}
                   onDrop={(e)=>dropToTeam(e, idx)}>
                <div className="teamHeader">
                  <div className="name">קבוצה {idx+1}</div>
                  <div className="meta">{avg} ממוצע | {sum.toFixed(1)} ס״כ</div>
                </div>
                {team.map((p)=>(
                  <div key={p.id} className="player-line"
                       draggable
                       onDragStart={(e)=>onDragStartFromTeam(e,p.id,idx)}>
                    <span><span className="handle">⋮⋮</span>{' '}{p.name}</span>
                    <span className="subtle">
                      {roleName(p.role)}
                      {!hideTeamRatings && <> · {p.rating}</>}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* טבלת כל השחקנים מתחת */}
      <div className="row" style={{marginTop:8, marginBottom:8}}>
        <button className="btn primary" onClick={()=>setShowAdd(true)}>הוסף שחקן</button>
      </div>

      <div className="playersBelow" ref={tableRef}>
        <PlayersTable
          players={sortedList}
          update={update}
          remove={remove}
          hideRatings={false}       /* לא מסתירים ציונים בטבלה */
          showDragHandle={true}
          onDragStartRow={onDragStartRow}
          sortBy={sortBy}
          dir={dir}
          onSort={handleSort}
        />
      </div>

      {showAdd && (
        <AddPlayerModal
          newPlayer={newPlayer}
          setNewPlayer={setNewPlayer}
          onCancel={()=>setShowAdd(false)}
          onSave={()=>{
            if(!newPlayer.name.trim()) return alert('שם?')
            add(newPlayer); setNewPlayer({name:'',role:'DF',rating:7,selected:true}); setShowAdd(false)
          }}
        />
      )}
    </div>
  )
}

/* ===== טבלת שחקנים לשימוש חוזר – סדר עמודות הפוך ===== */
function PlayersTable({players, update, remove, hideRatings, showDragHandle, onDragStartRow, sortBy, dir, onSort}){
  const Arrow = ({col}) => (sortBy===col ? <span className="arrow">{dir==='asc'?'▲':'▼'}</span> : <span className="arrow" style={{opacity:.3}}>↕</span>)
  return (
    <table className="table">
      <thead>
        <tr>
          <th className="th-sort" style={{width:80,textAlign:'center'}} onClick={()=>onSort('selected')}>משחק? <Arrow col="selected" /></th>
          <th className="th-sort" onClick={()=>onSort('name')}>שם <Arrow col="name" /></th>
          <th className="th-sort" style={{width:120}} onClick={()=>onSort('role')}>עמדה <Arrow col="role" /></th>
          {!hideRatings && <th className="th-sort" style={{width:90}} onClick={()=>onSort('rating')}>ציון <Arrow col="rating" /></th>}
          <th className="th-sort" onClick={()=>onSort('prefer')}>חייב עם <Arrow col="prefer" /></th>
          <th className="th-sort" onClick={()=>onSort('avoid')}>לא עם <Arrow col="avoid" /></th>
          <th style={{width:64}}>מחק</th>
          {showDragHandle && <th style={{width:36}}></th>}
        </tr>
      </thead>
      <tbody>
        {players.map(p=> (
          <tr key={p.id}>
            <td style={{textAlign:'center'}}><input type="checkbox" checked={!!p.selected} onChange={e=>update(p.id,{selected:e.target.checked})}/></td>
            <td><input className="mini" value={p.name} onChange={e=>update(p.id,{name:e.target.value})}/></td>
            <td>
              <select className="mini" value={p.role} onChange={e=>update(p.id,{role:e.target.value})}>
                {POS.map(([v,t])=> <option key={v} value={v}>{t}</option>)}
              </select>
            </td>
            {!hideRatings && (
              <td>
                <select className="mini" value={p.rating} onChange={e=>update(p.id,{rating:Number(e.target.value)})}>
                  {RATING_STEPS.map(n=> <option key={n} value={n}>{n}</option>)}
                </select>
              </td>
            )}
            <td><div className="chips">{(p.prefer||[]).map(n=> <span key={n} className="chip">{n}</span>)}</div></td>
            <td><div className="chips">{(p.avoid ||[]).map(n=> <span key={n} className="chip hollow">{n}</span>)}</div></td>
            <td><button className="btn danger" onClick={()=>remove(p.id)}>מחק</button></td>
            {showDragHandle && (
              <td title="גרור לקבוצה">
                <span className="handle" draggable onDragStart={(e)=>onDragStartRow?.(e, p.id)}>⋮⋮</span>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ===== מודלים ===== */
function AddPlayerModal({newPlayer,setNewPlayer,onCancel,onSave}){
  return (
    <div className="modal" onClick={onCancel}>
      <div className="box" onClick={e=>e.stopPropagation()}>
        <h3>הוספת שחקן</h3>
        <div className="row">
          <input className="mini" placeholder="שם" value={newPlayer.name} onChange={e=>setNewPlayer(p=>({...p,name:e.target.value}))} />
          <select className="mini" value={newPlayer.role} onChange={e=>setNewPlayer(p=>({...p,role:e.target.value}))}>
            {POS.map(([v,t])=><option key={v} value={v}>{t}</option>)}
          </select>
          <select className="mini" value={newPlayer.rating} onChange={e=>setNewPlayer(p=>({...p,rating:Number(e.target.value)}))}>
            {RATING_STEPS.map(n=> <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="switch"><input type="checkbox" checked={newPlayer.selected} onChange={e=>setNewPlayer(p=>({...p,selected:e.target.checked}))}/> משחק?</label>
        </div>
        <div className="row" style={{marginTop:10}}>
          <button className="btn" onClick={onCancel}>בטל</button>
          <button className="btn primary" onClick={onSave}>שמור</button>
        </div>
      </div>
    </div>
  )
}

/* ===== תצוגת הדפסה ===== */
function PrintPreviewModal({onClose, teams}){
  const today = new Date().toISOString().slice(0,10)
  return (
    <div className="modal printModal" onClick={onClose}>
      <div className="box" onClick={e=>e.stopPropagation()}>
        <div className="printBtnBar">
          <button className="btn primary" onClick={()=>window.print()}>יצוא PDF / הדפס</button>
          <button className="btn" onClick={onClose}>סגור</button>
        </div>
        <div className="sheetGrid">
          {teams.map((team,idx)=>(
            <div key={idx} className="sheet">
              <div className="sheetHeader">
                <div>קבוצה {idx+1}</div>
                <div>תאריך: {today}</div>
              </div>
              <table className="sheetTable">
                <thead>
                  <tr><th style={{width:'70%'}}>שחקן</th><th>שערים</th></tr>
                </thead>
                <tbody>
                  {team.map(p=>(
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>
                        <div className="boxes">
                          {Array.from({length:10}).map((_,i)=><div key={i} className="box"/>)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* בלוק ניצחון/תיקו/הפסד כמו בתמונה */}
              <div style={{marginTop:10}}>
                {['ניצחון','תיקו','הפסד',''].map((label,i)=>(
                  <div key={i} className="boxRow">
                    <div className="boxRow-label">{label}</div>
                    <div className="boxes">{Array.from({length:6}).map((_,j)=><div key={j} className="box"/>)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
