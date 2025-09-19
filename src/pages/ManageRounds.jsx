import React, { useState } from "react";
import "./manageRounds.css";

/* 
  props:
   rounds: [{id,date, teams:[{id,name, goals:[{playerId,count}...], wins:number, draws:number, losses:number}]}]
   onSaveRound(roundObj)
*/
export default function ManageRounds({ currentTeams = [], onSaveRound }) {
  const [roundDate, setRoundDate] = useState(new Date().toISOString().slice(0,10));
  const [grid, setGrid] = useState(() =>
    currentTeams.map(t => ({
      id: t.id,
      name: t.players.map(p=>p.name).join(" · "), // שמות בקבוצה – לא צריך בכותרת
      wins: 0, draws: 0, losses: 0,
      goals: t.players.map(p=>({ playerId:p.id, name:p.name, count:0 }))
    }))
  );

  const changeStat = (ti, key, val) => {
    const v = Math.max(0, Number(val||0));
    const copy = grid.slice();
    copy[ti] = { ...copy[ti], [key]: v };
    setGrid(copy);
  };

  const changeGoal = (ti, gi, val) => {
    const v = Math.max(0, Number(val||0));
    const copy = grid.slice();
    const goals = copy[ti].goals.slice();
    goals[gi] = { ...goals[gi], count: v };
    copy[ti] = { ...copy[ti], goals };
    setGrid(copy);
  };

  const save = () => {
    onSaveRound?.({
      date: roundDate,
      teams: grid
    });
  };

  return (
    <div className="rounds-page">
      <div className="topbar">
        <div>
          תאריך:{" "}
          <input type="date" value={roundDate} onChange={e=>setRoundDate(e.target.value)} />
        </div>
        <button className="btn primary" onClick={save}>שמור מחזור</button>
      </div>

      <div className="teams-wrap">
        {grid.map((t,ti)=>(
          <div className="round-card" key={t.id}>
            <div className="round-head">
              <div>קבוצה {t.id}</div>
              {/* אין צורך בשמות בכותרת — רשומים מתחת */}
            </div>
            <div className="stats-row">
              <label>ניצחונות</label>
              <input type="number" min="0" value={t.wins} onChange={e=>changeStat(ti,"wins",e.target.value)} />
              <label>תיקו</label>
              <input type="number" min="0" value={t.draws} onChange={e=>changeStat(ti,"draws",e.target.value)} />
              <label>הפסדים</label>
              <input type="number" min="0" value={t.losses} onChange={e=>changeStat(ti,"losses",e.target.value)} />
            </div>
            <div className="goals-grid">
              <div className="goals-head">שערים במחזור</div>
              {t.goals.map((g,gi)=>(
                <div className="goal-row" key={g.playerId}>
                  <div className="pname">{g.name}</div>
                  <input type="number" min="0" value={g.count} onChange={e=>changeGoal(ti,gi,e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
