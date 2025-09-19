import React, { useMemo, useState } from "react";
import "./ranking.css";

/*
  props:
    rounds: רשימת כל המחזורים ההיסטוריים
*/
export default function Ranking({ rounds = [] }) {
  const [month, setMonth] = useState(new Date().getMonth()+1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [withBonus, setWithBonus] = useState(true);

  // דוגמאות חישוב — תתאם למבנה הנתונים אצלך
  const monthly = useMemo(()=>calcMonthly(rounds, year, month, { withBonus }),[rounds,year,month,withBonus]);
  const yearly  = useMemo(()=>calcYearly(rounds, year, { withBonus }), [rounds,year,withBonus]);
  const allTime = useMemo(()=>calcAllTime(rounds, { withBonus }), [rounds,withBonus]);

  // רשימת מחזורים לבחירה – מוצגת מעל, צמוד לשמאל
  const roundList = useMemo(()=>rounds
    .slice().sort((a,b)=>new Date(b.date)-new Date(a.date))
    .map(r=>({ id:r.id||r.date, label:new Date(r.date).toLocaleDateString("he-IL") })), [rounds]);

  const [selectedRound, setSelectedRound] = useState(roundList[0]?.id);

  return (
    <div className="ranking-page">
      <div className="filters">
        <label><input type="checkbox" checked={withBonus} onChange={e=>setWithBonus(e.target.checked)} /> עם בונוסים</label>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))}>
          {Array.from({length:12},(_,i)=>(<option key={i+1} value={i+1}>{i+1}</option>))}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))}>
          {Array.from({length:4},(_,i)=>(<option key={i} value={year-2+i}>{year-2+i}</option>))}
        </select>

        <div className="rounds-inline">
          {roundList.map(r=>(
            <button
              key={r.id}
              className={`pill ${selectedRound===r.id?"sel":""}`}
              onClick={()=>setSelectedRound(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tables-wrap">
        <RankingTable title="מלך השערים — חודשי" rows={monthly.topScorers} />
        <RankingTable title="אליפות החודש (כולל)" rows={monthly.champ} />
        <RankingTable title="אליפות העונה (שנה)" rows={yearly.champ} />
        <RankingTable title="אליפות כל הזמנים" rows={allTime.champ} />
      </div>
    </div>
  );
}

function RankingTable({ title, rows=[] }) {
  return (
    <div className="rank-card">
      <div className="rank-head">{title}</div>
      <table className="rank-table">
        <thead><tr><th>#</th><th>שחקן</th><th>ניקוד</th><th>מפגשים</th><th>ממוצע</th></tr></thead>
        <tbody>
          {rows.map((r,i)=>(
            <tr key={r.id||i}>
              <td>{i+1}</td>
              <td className="n">{r.name}</td>
              <td>{r.pts}</td>
              <td>{r.games}</td>
              <td>{(r.games? (r.pts/r.games):0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/*** חישובים דמיוניים — החלף לפי הנתונים שלך ***/
function calcMonthly(rounds, y, m, {withBonus}) {
  return {
    topScorers: [],
    champ: []
  };
}
function calcYearly(rounds, y, {withBonus}) {
  return { champ: [] };
}
function calcAllTime(rounds, {withBonus}) {
  return { champ: [] };
