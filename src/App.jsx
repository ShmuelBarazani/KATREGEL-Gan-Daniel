import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/* ===== נתוני קבע ===== */
const LS_KEY = 'katregel_state_v4'
const POS = [ ['GK','שוער'], ['DF','הגנה'], ['MF','קישור'], ['FW','התקפה'] ]
const RATING_STEPS = Array.from({length:19}, (_,i)=> (1 + i*0.5)) // 1..10

/* ===== כלי עזר ===== */
const uid = () => Math.random().toString(36).slice(2) + '-' + Date.now().toString(36)
const roleName = (code) => ({GK:'שוער',DF:'הגנה',MF:'קישור',FW:'התקפה'}[code]||code)
const normRole = (v)=>{const t=(v||'').toString().trim().toLowerCase(); if(['gk','ש','שוער'].includes(t))return 'GK'; if(['df','ה','הגנה','בלם','מגן'].includes(t))return 'DF'; if(['mf','ק','קישור','קשר'].includes(t))return 'MF'; if(['fw','ח','התקפה','חלוץ','כנף'].includes(t))return 'FW'; return ['GK','DF','MF','FW'].includes(v)?v:'MF'}

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

/* players.json: id,name,pos(or role),r(or rating),selected,prefer,avoid */
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
/* המרת מזהים לשמות בתצוגת prefer/avoid (אם בקובץ נרשמו ids) */
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

  // Random קל כדי לקבל קומבינציות שונות בכל הפעלה
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
  return teams.map(t=>t.list)
}

/* ====== האפליקציה ====== */
export default function App(){
  const [store,setStore]=useStore()
  const [tab,setTab]=useState('teams') // נפתח על "כוחות" כמו בצילום
  const [teams,setTeams]=useState([])
  const [numTeams,setNumTeams]=useState(4)
  const [hideRatings,setHideRatings]=useState(false)
  const [printMode,setPrintMode]=useState(false)

  // טעינה ראשונית מ-public/players.json
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
  const selectedCount = useMemo(()=> store.players.filter(p=>p.selected).length, [store.players])

  /* -------- פעולות שחקנים -------- */
  const addPlayer=(p)=> setStore(s=>({...s,players:[...s.players,{id:uid(),selected:true,prefer:[],avoid:[],...p}]}))
  const removePlayer=(id)=> setStore(s=>({...s,players:s.players.filter(p=>String(p.id)!==String(id))}))
  const updatePlayer=(id,patch)=> setStore(s=>({...s,players:s.players.map(p=>String(p.id)===String(id)?{...p,...patch}:p)}))

  /* -------- כוחות -------- */
  const makeTeams=()=>{const t=buildTeamsBalanced(store.players,numTeams); setTeams(t); setTab('teams')}
  const clearTeams=()=>setTeams([])

  /* -------- תוצאות (ללשונית דירוג, ללא שינוי כעת) -------- */
  const [selectedSessionId,setSelectedSessionId]=useState('')
  const resultsFor = (sid)=> store.results[sid]||{}
  const setResult=(sid,pid,goals)=> setStore(s=>({...s,results:{...s.results,[sid]:{...resultsFor(sid), [pid]:goals}}}))

  /* ====== UI ====== */
  return (
    <div className={printMode? 'print page':'page'}>
      <div className="appbar">
        <div className="title">⚽ קטרגל – גן-דניאל</div>
        <div className="tabs">
          <button className={`tab ${tab==='players'?'active':''}`} onClick={()=>setTab('players')}>שחקנים</button>
          <button className={`tab ${tab==='teams'?'active':''}`} onClick={()=>setTab('teams')}>כוחות</button>
          <button className={`tab ${tab==='ranking'?'active':''}`} onClick={()=>setTab('ranking')}>דירוג</button>
        </div>
      </div>

      <div className="controls" style={{marginBottom:12}}>
        <div className="row">
          <span className="badge" title="מס׳ קבוצות">{numTeams}</span>
          <button className="btn" onClick={()=>setNumTeams(n=>Math.max(2,n-1))}>−</button>
          <button className="btn" onClick={()=>setNumTeams(n=>Math.min(8,n+1))}>+</button>
        </div>
        <div className="switch"><input type="checkbox" checked={hideRatings} onChange={e=>setHideRatings(e.target.checked)} /> הסתר ציונים</div>
        <button className="btn" onClick={()=>setPrintMode(v=>!v)}>תצוגת הדפסה</button>
        <button className="btn" onClick={clearTeams}>קבע מחזור</button>{/* לשמירה אמיתית – כמו בגרסאות הקודמות אפשר להחזיר saveSession */}
        <button className="btn primary" onClick={makeTeams}>עשה כוחות</button>
        <span className="badge">מסומנים: {selectedCount}</span>
      </div>

      {tab==='teams' && (
        <TeamsScreen
          players={store.players}
          update={updatePlayer}
          remove={removePlayer}
          add={addPlayer}
          hideRatings={hideRatings}
          teams={teams}
          setTeams={setTeams}
        />
      )}

      {tab==='players' && (
        <PlayersScreen
          players={store.players}
          update={updatePlayer}
          remove={removePlayer}
          add={addPlayer}
          hideRatings={hideRatings}
        />
      )}

      {/* לשונית דירוג נשארה כפי שמימשנו קודם – ניתן להחזיר אם תרצה */}
    </div>
  )
}

/* =================== מסכי משנה =================== */

function PlayersScreen({players, update, remove, add, hideRatings}){
  const wrapRef = useStickyScroll('playersTable')
  const [editing,setEditing]=useState(null)
  const [showAdd,setShowAdd]=useState(false)
  const [newPlayer,setNewPlayer]=useState({name:'',role:'DF',rating:7,selected:true})

  const sorted=[...players].sort((a,b)=> a.name.localeCompare(b.name,'he'))

  return (
    <div className="card">
      <div className="row" style={{marginBottom:10}}>
        <button className="btn primary" onClick={()=>setShowAdd(true)}>הוסף שחקן</button>
      </div>

      <div className="tableWrap" ref={wrapRef}>
        <PlayersTable
          players={sorted}
          update={update}
          remove={remove}
          hideRatings={hideRatings}
          showDragHandle={false}
        />
      </div>

      {editing && (
        <EditLinksModal
          title={editing.type==='prefer'? 'חייב עם':'לא עם'}
          value={editing.value}
          onCancel={()=>setEditing(null)}
          onSave={(list)=>{ update(editing.id,{ [editing.type]:list }); setEditing(null)}}
        />
      )}

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

function TeamsScreen({players, update, remove, add, hideRatings, teams, setTeams}){
  /* מיון/סינון */
  const [sortBy,setSortBy]=useState('name')
  const [dir,setDir]=useState('asc')
  const [showAdd,setShowAdd]=useState(false)
  const [newPlayer,setNewPlayer]=useState({name:'',role:'DF',rating:7,selected:true})
  const tableRef = useStickyScroll('teamsPlayersTable')
  const teamsRef = useStickyScroll('teamsGrid')

  const sorted = useMemo(()=>{
    const arr=[...players]
    const cmp = {
      name: (a,b)=> a.name.localeCompare(b.name,'he'),
      role: (a,b)=> roleName(a.role).localeCompare(roleName(b.role),'he'),
      rating: (a,b)=> a.rating-b.rating,
      selected: (a,b)=> Number(a.selected)-Number(b.selected),
    }[sortBy]
    arr.sort(cmp)
    if(dir==='desc') arr.reverse()
    return arr
  },[players,sortBy,dir])

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
    setTeams(prev=>{
      const clone = prev.map(t=>[...t])
      // אם הגיע מרשימה – רק מוסיפים אם לא קיים
      if(!clone[targetIdx].some(p=>String(p.id)===String(data.pid))){
        const obj = players.find(p=>String(p.id)===String(data.pid))
        if(obj) clone[targetIdx].push(obj)
      }
      // אם הגיע מקבוצה אחרת – נוריד משם
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

  return (
    <div className="card">
      {/* טבלת כל השחקנים – בדיוק כמו למעלה, כולל ידית גרירה */}
      <div className="row" style={{marginBottom:10}}>
        <button className="btn primary" onClick={()=>setShowAdd(true)}>הוסף שחקן</button>
        <label>מיון:
          <select className="mini" value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{marginInlineStart:6}}>
            <option value="name">שם</option>
            <option value="role">עמדה</option>
            <option value="rating">ציון</option>
            <option value="selected">מסומן</option>
          </select>
        </label>
        <button className="btn" onClick={()=>setDir(d=>d==='asc'?'desc':'asc')}>{dir==='asc'?'⬆️':'⬇️'}</button>
      </div>

      <div className="tableWrap" ref={tableRef}>
        <PlayersTable
          players={sorted}
          update={update}
          remove={remove}
          hideRatings={hideRatings}
          showDragHandle={true}
          onDragStartRow={onDragStartRow}
        />
      </div>

      {/* קבוצות – זו לצד זו */}
      <div className="section-title" style={{marginTop:12}}>קבוצות למחזור</div>
      <div className="teamsGrid" ref={teamsRef}>
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
              {team.map((p,i)=>(
                <div key={p.id} className="player-line"
                     draggable
                     onDragStart={(e)=>onDragStartFromTeam(e,p.id,idx)}>
                  <span>• {p.name}</span>
                  <span className="subtle">{roleName(p.role)} · {p.rating} <span className="handle">⋮⋮</span></span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* הוספת שחקן */}
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

/* ===== טבלת שחקנים לשימוש חוזר (עם/בלי ידית גרירה) ===== */
function PlayersTable({players, update, remove, hideRatings, showDragHandle, onDragStartRow}){
  return (
    <table className="table">
      <thead>
        <tr>
          <th style={{width:64}}>מחק</th>
          <th>לא עם</th>
          <th>חייב עם</th>
          {!hideRatings && <th style={{width:90}}>ציון</th>}
          <th style={{width:120}}>עמדה</th>
          <th>שם</th>
          <th style={{width:80}}>משחק?</th>
          {showDragHandle && <th style={{width:36}}></th>}
        </tr>
      </thead>
      <tbody>
        {players.map(p=> (
          <tr key={p.id}>
            <td><button className="btn danger" onClick={()=>remove(p.id)}>מחק</button></td>
            <td>
              <div className="chips">
                {(p.avoid||[]).map(n=> <span key={n} className="chip hollow">{n}</span>)}
              </div>
            </td>
            <td>
              <div className="chips">
                {(p.prefer||[]).map(n=> <span key={n} className="chip">{n}</span>)}
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

function EditLinksModal({title,value,onCancel,onSave}){
  const [val,setVal]=useState(value||'')
  return (
    <div className="modal" onClick={onCancel}>
      <div className="box" onClick={e=>e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="footer-note">הפרד שמות בפסיקים, למשל: אבי, דני, רועי</p>
        <textarea value={val} onChange={e=>setVal(e.target.value)} />
        <div className="row" style={{marginTop:10}}>
          <button className="btn" onClick={onCancel}>בטל</button>
          <button className="btn primary" onClick={()=>onSave(val.split(',').map(s=>s.trim()).filter(Boolean))}>שמור</button>
        </div>
      </div>
    </div>
  )
}
