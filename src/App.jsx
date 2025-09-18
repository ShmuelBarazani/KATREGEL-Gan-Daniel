import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/* ===== קבועים וכלי עזר ===== */
const LS_KEY = 'katregel_state_v9'
const POS = [ ['GK','שוער'], ['DF','הגנה'], ['MF','קישור'], ['FW','התקפה'] ]
const RATING_STEPS = Array.from({length:19}, (_,i)=> (1 + i*0.5)) // 1..10
const uid = () => Math.random().toString(36).slice(2) + '-' + Date.now().toString(36)
const roleName = (c)=>({GK:'שוער',DF:'הגנה',MF:'קישור',FW:'התקפה'}[c]||c)
const normRole=(v)=>{const t=(v||'').toString().trim().toLowerCase();if(['gk','ש','שוער'].includes(t))return'GK';if(['df','ה','הגנה','בלם','מגן'].includes(t))return'DF';if(['mf','ק','קישור','קשר'].includes(t))return'MF';if(['fw','ח','התקפה','חלוץ','כנף'].includes(t))return'FW';return['GK','DF','MF','FW'].includes(v)?v:'MF'}
const sum = a=>a.reduce((s,x)=>s+Number(x||0),0)
const avg = a=>a.length?sum(a)/a.length:0
const sortDescRating = a=>a.sort((x,y)=>Number(y.rating||0)-Number(x.rating||0))

function useStickyScroll(key){
  const ref = useRef(null)
  useLayoutEffect(()=>{
    const el=ref.current; if(!el) return
    const y=sessionStorage.getItem('scroll:'+key); if(y) el.scrollTop=+y
    const on=()=>sessionStorage.setItem('scroll:'+key, String(el.scrollTop))
    el.addEventListener('scroll',on); return ()=>el.removeEventListener('scroll',on)
  },[key]); return ref
}

/* קריאת players.json/CSV */
function parsePlayersText(text){
  text=(text||'').trim(); if(!text) return []
  try{
    const arr=JSON.parse(text)
    if(Array.isArray(arr)) return arr.map(x=>({
      id:(x.id!=null?String(x.id):uid()),
      name:x.name||x.שם, role:normRole(x.role||x.תפקיד||x.pos),
      rating:Number(x.rating||x.ציון||x.r||7),
      selected:Boolean(x.selected),
      prefer:Array.isArray(x.prefer)?x.prefer.map(String):[],
      avoid:Array.isArray(x.avoid)?x.avoid.map(String):[],
    })).filter(p=>p.name)
  }catch{}
  const rows=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean), out=[]
  for(const r of rows){
    const parts=r.split(/[\t,;|]/).map(s=>s.trim()).filter(Boolean)
    if(parts.length===1) out.push({id:uid(),name:parts[0],role:'MF',rating:7,selected:true,prefer:[],avoid:[]})
    else{const[nm,rl,rt]=parts; out.push({id:uid(),name:nm,role:normRole(rl),rating:Number(rt||7),selected:true,prefer:[],avoid:[]})}
  }
  return out
}
function refsToNames(list){
  const id2name=new Map(list.map(p=>[String(p.id),p.name]))
  return list.map(p=>({...p,
    prefer:(p.prefer||[]).map(x=>id2name.get(String(x))||String(x)),
    avoid:(p.avoid||[]).map(x=>id2name.get(String(x))||String(x)),
  }))
}

/* אחסון */
function useStore(){
  const [state,setState]=useState(()=>{try{const raw=localStorage.getItem(LS_KEY);return raw?JSON.parse(raw):{players:[]}}catch{return{players:[]}}})
  useEffect(()=>{try{localStorage.setItem(LS_KEY,JSON.stringify(state))}catch{}},[state])
  return [state,setState]
}

/* אילוצים */
const violatesAvoid=(team,p)=> team.some(x=>x.avoid?.includes(p.name) || p.avoid?.includes(x.name))
const preferSatisfied=(team,p)=> p.prefer?.length? team.some(x=>p.prefer.includes(x.name)):true
const validTeam=(team)=> team.every((p,i)=> !violatesAvoid(team.filter((_,j)=>j!==i),p) && (!p.prefer?.length || preferSatisfied(team.filter((_,j)=>j!==i),p)))

/* === יצירת כוחות מאוזנים === */
function buildTeamsBalanced(players, k){
  const pool=players.filter(p=>p.selected)
  const maxPer=Math.ceil(pool.length/k), minPer=Math.floor(pool.length/k)
  const teams=Array.from({length:k},()=>({list:[],sum:0}))
  const globalAvg=avg(pool.map(p=>p.rating))

  // Greedy עם אילוצים
  const sorted=[...pool].sort((a,b)=>(b.rating+Math.random()*0.15)-(a.rating+Math.random()*0.15))
  for(const p of sorted){
    let best=-1,scoreBest=Infinity
    for(let i=0;i<k;i++){
      const t=teams[i]; if(t.list.length>=maxPer) continue
      if(violatesAvoid(t.list,p)) continue
      const prefOK=preferSatisfied(t.list,p)
      const newAvg=(t.sum+p.rating)/(t.list.length+1)
      const sc=Math.abs(newAvg-globalAvg)+(prefOK?0:1000)
      if(sc<scoreBest){scoreBest=sc; best=i}
    }
    if(best<0){ // fallback – בלי להפר גודל
      let i=teams.findIndex(t=>t.list.length<maxPer); if(i<0) i=0
      teams[i].list.push(p); teams[i].sum+=p.rating
    }else{ teams[best].list.push(p); teams[best].sum+=p.rating }
  }

  // שיפור: העברות/החלפות לצמצום פער ממוצעים
  const T=teams.map(t=>({list:[...t.list],sum:sum(t.list.map(p=>p.rating))}))
  const target=sum(pool.map(p=>p.rating))/k
  const objective=(TT)=>{const A=TT.map(t=>t.list.length?avg(t.list.map(p=>p.rating)):target); return (Math.max(...A)-Math.min(...A))*100 + A.reduce((s,a)=>s+(a-target)**2,0)}
  let bestObj=objective(T), stale=0
  const limit=4000
  for(let it=0; it<limit && stale<300; it++){
    // בחר גבוהה ונמוכה
    let hi=0, lo=0
    const sums=T.map(t=>avg(t.list.map(p=>p.rating))||0)
    hi=sums.indexOf(Math.max(...sums)); lo=sums.indexOf(Math.min(...sums))
    if(hi===lo) break
    // נסה הזזה מהגבוה לנמוך
    let improved=false
    for(const pa of [...T[hi].list]){
      const A=[...T[hi].list].filter(x=>x!==pa), B=[...T[lo].list,pa]
      if(A.length<minPer || B.length>maxPer) continue
      if(!validTeam(A) || !validTeam(B)) continue
      const TT=T.map((t,i)=>({list: i===hi?A : i===lo?B : t.list}))
      const obj=objective(TT)
      if(obj+1e-9 < bestObj){ T[hi].list=A; T[lo].list=B; bestObj=obj; improved=true; break }
    }
    if(!improved){
      // נסה החלפה בין hi לנמוך ביותר אחר
      let bestSwap=null, bestVal=Infinity
      for(const pa of T[hi].list){
        for(let j=0;j<k;j++){ if(j===hi) continue
          for(const pb of T[j].list){
            const A=[...T[hi].list].filter(x=>x!==pa).concat(pb)
            const B=[...T[j].list].filter(x=>x!==pb).concat(pa)
            if(A.length<minPer||B.length<minPer||A.length>maxPer||B.length>maxPer) continue
            if(!validTeam(A)||!validTeam(B)) continue
            const TT=T.map((t,i)=>({list: i===hi?A : i===j?B : t.list}))
            const obj=objective(TT)
            if(obj<bestVal){bestVal=obj; bestSwap={j,pa,pb,A,B}}
          }
        }
      }
      if(bestSwap && bestVal+1e-9<bestObj){ T[hi].list=bestSwap.A; T[bestSwap.j].list=bestSwap.B; bestObj=bestVal; improved=true }
    }
    stale = improved?0:stale+1
  }

  return T.map(t=>sortDescRating(t.list))
}

/* ====== APP ====== */
export default function App(){
  const [store,setStore]=useStore()
  const [tab,setTab]=useState('teams')
  const [teams,setTeams]=useState([])
  const [numTeams,setNumTeams]=useState(4)
  const [hideTeamRatings,setHideTeamRatings]=useState(false)
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

  const selectedCount=useMemo(()=>store.players.filter(p=>p.selected).length,[store.players])

  const addPlayer=p=>setStore(s=>({...s,players:[...s.players,{id:uid(),selected:true,prefer:[],avoid:[],...p}]}))
  const removePlayer=id=>setStore(s=>({...s,players:s.players.filter(p=>String(p.id)!==String(id))}))
  const updatePlayer=(id,patch)=>setStore(s=>({...s,players:s.players.map(p=>String(p.id)===String(id)?{...p,...patch}:p)}))

  const makeTeams=()=>{const t=buildTeamsBalanced(store.players,numTeams); setTeams(t); setTab('teams')}
  const clearTeams=()=>setTeams([])

  const setTeamsSorted=updater=>{
    setTeams(prev=>{
      const next=typeof updater==='function'?updater(prev):updater
      return next.map(g=>sortDescRating([...g]))
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
          <span className="badge">{numTeams}</span>
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

/* ===== מסכי משנה ===== */

function PlayersScreen({players, update, remove, add}){
  const wrapRef = useStickyScroll('playersTable')
  const [showAdd,setShowAdd]=useState(false)
  const [newPlayer,setNewPlayer]=useState({name:'',role:'DF',rating:7,selected:true})

  const [sortBy,setSortBy]=useState('name')
  const [dir,setDir]=useState('asc')
  const sorted = useMemo(()=>{
    const a=[...players]
    const cmp={
      name:(x,y)=>x.name.localeCompare(y.name,'he'),
      role:(x,y)=>roleName(x.role).localeCompare(roleName(y.role),'he'),
      rating:(x,y)=>x.rating-y.rating,
      selected:(x,y)=>Number(x.selected)-Number(y.selected),
      prefer:(x,y)=>(x.prefer?.length||0)-(y.prefer?.length||0),
      avoid:(x,y)=>(x.avoid?.length||0)-(y.avoid?.length||0),
    }[sortBy]||(()=>0)
    a.sort(cmp); if(dir==='desc') a.reverse(); return a
  },[players,sortBy,dir])
  const onSort=col=>setSortBy(p=>{if(p===col){setDir(d=>d==='asc'?'desc':'asc');return p} setDir('asc');return col})

  return (
    <div className="card">
      <div className="row" style={{marginBottom:10}}>
        <button className="btn primary" onClick={()=>setShowAdd(true)}>הוסף שחקן</button>
      </div>
      <div style={{maxHeight:'70vh', overflow:'auto'}} ref={wrapRef}>
        <PlayersTable players={sorted} update={update} remove={remove}
          hideRatings={false} showDragHandle={false} onDragStartRow={()=>{}}
          sortBy={sortBy} dir={dir} onSort={onSort} />
      </div>

      {showAdd && (
        <AddPlayerModal newPlayer={newPlayer} setNewPlayer={setNewPlayer}
          onCancel={()=>setShowAdd(false)}
          onSave={()=>{ if(!newPlayer.name.trim()) return alert('שם?'); add(newPlayer); setNewPlayer({name:'',role:'DF',rating:7,selected:true}); setShowAdd(false) }} />
      )}
    </div>
  )
}

function TeamsScreen({players, update, remove, add, teams, setTeamsSorted, hideTeamRatings}){
  const [sortBy,setSortBy]=useState('name')
  const [dir,setDir]=useState('asc')
  const tableRef=useStickyScroll('teamsPlayersTable')
  const teamsRef=useStickyScroll('teamsGrid')

  const sortedList=useMemo(()=>{
    const a=[...players]
    const cmp={
      name:(x,y)=>x.name.localeCompare(y.name,'he'),
      role:(x,y)=>roleName(x.role).localeCompare(roleName(y.role),'he'),
      rating:(x,y)=>x.rating-y.rating,
      selected:(x,y)=>Number(x.selected)-Number(y.selected),
      prefer:(x,y)=>(x.prefer?.length||0)-(y.prefer?.length||0),
      avoid:(x,y)=>(x.avoid?.length||0)-(y.avoid?.length||0),
    }[sortBy]||(()=>0)
    a.sort(cmp); if(dir==='desc') a.reverse(); return a
  },[players,sortBy,dir])
  const handleSort=col=>setSortBy(p=>{if(p===col){setDir(d=>d==='asc'?'desc':'asc');return p} setDir('asc');return col})

  /* DnD – העברה (לא שכפול) */
  const onDragStartRow=(e,pid)=>{ e.dataTransfer.setData('application/json', JSON.stringify({pid,from:'list'})); e.dataTransfer.effectAllowed='move' }
  const onDragOver=e=>{ e.preventDefault(); e.currentTarget.classList.add('over') }
  const onDragLeave=e=>{ e.currentTarget.classList.remove('over') }
  const dropToTeam=(e,targetIdx)=>{
    e.preventDefault(); e.currentTarget.classList.remove('over')
    const data=JSON.parse(e.dataTransfer.getData('application/json')||'{}'); if(!data.pid) return
    setTeamsSorted(prev=>{
      const clone=prev.map(t=>[...t])
      // הסר מכל קבוצה אחרת (כדי שלא יהיה כפילות)
      for(let i=0;i<clone.length;i++){
        const j=clone[i].findIndex(p=>String(p.id)===String(data.pid))
        if(j>=0) clone[i].splice(j,1)
      }
      // הוסף ליעד אם אינו קיים
      if(!clone[targetIdx].some(p=>String(p.id)===String(data.pid))){
        const obj=players.find(p=>String(p.id)===String(data.pid))
        if(obj) clone[targetIdx].push(obj)
      }
      return clone
    })
  }
  const onDragStartFromTeam=(e,pid,fromIdx)=>{ e.dataTransfer.setData('application/json', JSON.stringify({pid,from:fromIdx})); e.dataTransfer.effectAllowed='move' }

  const [showAdd,setShowAdd]=useState(false)
  const [newPlayer,setNewPlayer]=useState({name:'',role:'DF',rating:7,selected:true})

  return (
    <div className="card">
      <div className="teamsTop" ref={teamsRef}>
        <div className="teamsGrid">
          {teams.length===0 && <p className="footer-note" style={{gridColumn:'1/-1'}}>עוד לא נוצרו כוחות. לחץ “עשה כוחות”.</p>}
          {teams.map((team,idx)=>{
            const ratings=team.map(p=>p.rating); const s=sum(ratings); const a=ratings.length?(s/ratings.length).toFixed(2):'—'
            return (
              <div key={idx} className="teamCard dropzone" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={(e)=>dropToTeam(e,idx)}>
                <div className="teamHeader">
                  <div className="name">קבוצה {idx+1}</div>
                  <div className="meta">{a} ממוצע | {s.toFixed(1)} ס״כ</div>
                </div>
                {team.map((p)=>(
                  <div key={p.id} className="player-line" draggable onDragStart={(e)=>onDragStartFromTeam(e,p.id,idx)}>
                    <span><span className="handle">⋮⋮</span> {p.name}</span>
                    <span className="subtle">{roleName(p.role)}{!hideTeamRatings && <> · {p.rating}</>}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      <div className="row" style={{marginTop:8, marginBottom:8}}>
        <button className="btn primary" onClick={()=>setShowAdd(true)}>הוסף שחקן</button>
      </div>

      <div className="playersBelow" ref={tableRef}>
        <PlayersTable players={sortedList} update={update} remove={remove}
          hideRatings={false} showDragHandle={true} onDragStartRow={onDragStartRow}
          sortBy={sortBy} dir={dir} onSort={handleSort} />
      </div>

      {showAdd && (
        <AddPlayerModal newPlayer={newPlayer} setNewPlayer={setNewPlayer}
          onCancel={()=>setShowAdd(false)}
          onSave={()=>{ if(!newPlayer.name.trim()) return alert('שם?'); add(newPlayer); setNewPlayer({name:'',role:'DF',rating:7,selected:true}); setShowAdd(false) }} />
      )}
    </div>
  )
}

/* טבלת שחקנים – סדר עמודות הפוך ומיון בכותרות */
function PlayersTable({players, update, remove, hideRatings, showDragHandle, onDragStartRow, sortBy, dir, onSort}){
  const Arrow=({col})=> sortBy===col ? <span className="arrow">{dir==='asc'?'▲':'▼'}</span> : <span className="arrow" style={{opacity:.3}}>↕</span>
  return (
    <table className="table">
      <thead>
        <tr>
          <th className="th-sort" style={{width:80,textAlign:'center'}} onClick={()=>onSort('selected')}>משחק? <Arrow col="selected"/></th>
          <th className="th-sort" onClick={()=>onSort('name')}>שם <Arrow col="name"/></th>
          <th className="th-sort" style={{width:120}} onClick={()=>onSort('role')}>עמדה <Arrow col="role"/></th>
          {!hideRatings && <th className="th-sort" style={{width:90}} onClick={()=>onSort('rating')}>ציון <Arrow col="rating"/></th>}
          <th className="th-sort" onClick={()=>onSort('prefer')}>חייב עם <Arrow col="prefer"/></th>
          <th className="th-sort" onClick={()=>onSort('avoid')}>לא עם <Arrow col="avoid"/></th>
          <th style={{width:64}}>מחק</th>
          {showDragHandle && <th style={{width:36}}></th>}
        </tr>
      </thead>
      <tbody>
        {players.map(p=>(
          <tr key={p.id}>
            <td style={{textAlign:'center'}}><input type="checkbox" checked={!!p.selected} onChange={e=>update(p.id,{selected:e.target.checked})}/></td>
            <td><input className="mini" value={p.name} onChange={e=>update(p.id,{name:e.target.value})}/></td>
            <td>
              <select className="mini" value={p.role} onChange={e=>update(p.id,{role:e.target.value})}>
                {POS.map(([v,t])=><option key={v} value={v}>{t}</option>)}
              </select>
            </td>
            {!hideRatings && (
              <td>
                <select className="mini" value={p.rating} onChange={e=>update(p.id,{rating:Number(e.target.value)})}>
                  {RATING_STEPS.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </td>
            )}
            <td><div className="chips">{(p.prefer||[]).map(n=><span key={n} className="chip">{n}</span>)}</div></td>
            <td><div className="chips">{(p.avoid||[]).map(n=><span key={n} className="chip hollow">{n}</span>)}</div></td>
            <td><button className="btn danger" onClick={()=>remove(p.id)}>מחק</button></td>
            {showDragHandle && <td title="גרור לקבוצה"><span className="handle" draggable onDragStart={(e)=>onDragStartRow?.(e,p.id)}>⋮⋮</span></td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* מודלים */
function AddPlayerModal({newPlayer,setNewPlayer,onCancel,onSave}){
  return (
    <div className="modal" onClick={onCancel}>
      <div className="box" onClick={e=>e.stopPropagation()}>
        <h3>הוספת שחקן</h3>
        <div className="row">
          <input className="mini" placeholder="שם" value={newPlayer.name} onChange={e=>setNewPlayer(p=>({...p,name:e.target.value}))}/>
          <select className="mini" value={newPlayer.role} onChange={e=>setNewPlayer(p=>({...p,role:e.target.value}))}>
            {POS.map(([v,t])=><option key={v} value={v}>{t}</option>)}
          </select>
          <select className="mini" value={newPlayer.rating} onChange={e=>setNewPlayer(p=>({...p,rating:Number(e.target.value)}))}>
            {RATING_STEPS.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
          <label className="switch"><input type="checkbox" checked={newPlayer.selected} onChange={e=>setNewPlayer(p=>({...p,selected:e.target.checked}))}/> משחק?</label>
        </div>
        <div className="row" style={{marginTop:10}}>
          <button className="btn" onClick={onCancel}>סגור</button>
          <button className="btn primary" onClick={onSave}>שמור</button>
        </div>
      </div>
    </div>
  )
}

/* תצוגת הדפסה – Preview 1:1 */
function PrintPreviewModal({onClose, teams}){
  const today=new Date().toISOString().slice(0,10)
  return (
    <div className="modal printModal" onClick={onClose}>
      <div className="box" onClick={e=>e.stopPropagation()}>
        <div className="row" style={{gap:8, marginBottom:10}}>
          <button className="btn primary" onClick={()=>window.print()}>יצוא PDF / הדפס</button>
          <button className="btn" onClick={onClose}>סגור</button>
        </div>
        <div className="sheetGrid">
          {teams.map((team,idx)=>(
            <div key={idx} className="sheet">
              <div className="sheetHeader">
                <div>תאריך: {today}</div>
                <div>קבוצה {idx+1}</div>
              </div>
              <table className="sheetTable">
                <thead>
                  <tr><th style={{width:'65%'}}>שחקן</th><th>שערים</th></tr>
                </thead>
                <tbody>
                  {team.map(p=>(
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td><div className="boxes">{Array.from({length:8}).map((_,i)=><div key={i} className="box"/>)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{marginTop:10}}>
                {['ניצחון','תיקו','הפסד'].map((label,i)=>(
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
