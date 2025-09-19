import React from "react";
import "./print.css";

/*
  props:
    open: boolean
    onClose()
    onPrint()
    dateStr: string (תאריך)
    teams: [{id, players:[{id,name}], ...}]
*/
export default function PrintModal({ open, onClose, onPrint, dateStr, teams }) {
  if (!open) return null;

  // 4 כרטיסים בעמוד (2×2)
  const chunks = [];
  for (let i = 0; i < teams.length; i += 4) chunks.push(teams.slice(i, i + 4));

  return (
    <div className="print-overlay">
      <div className="print-dialog">
        <div className="print-header">
          <button className="btn outline" onClick={onClose}>סגור</button>
          <button className="btn primary" onClick={onPrint}>יצוא / PDF / הדפס</button>
          <div className="spacer" />
          <div className="title">תצוגת הדפסה</div>
        </div>

        <div className="print-pages">
          {chunks.map((page, idx) => (
            <div key={idx} className="print-page">
              {page.map(team => <TeamCard key={team.id} team={team} dateStr={dateStr} />)}
              {Array.from({length: 4 - page.length}).map((_,i)=><div key={`stub-${i}`} className="teamcard stub"/>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamCard({ team, dateStr }) {
  const boxes = Array.from({ length: 10 });

  return (
    <div className="teamcard">
      <div className="teamcard-head">
        <div>קבוצה {team.id}</div>
        <div className="date">{dateStr}</div>
      </div>

      <table className="print-table">
        <thead>
          <tr>
            <th className="w-goals">שערים</th>
            <th>שחקן</th>
          </tr>
        </thead>
        <tbody>
          {team.players.map(p => (
            <tr key={p.id}>
              <td className="goals-cells">
                {boxes.map((_,i)=>(<span key={i} className="box" />))}
              </td>
              <td className="player-name">{p.name}</td>
            </tr>
          ))}
          {/* שורת רווח */}
          <tr><td colSpan={2}>&nbsp;</td></tr>
          {/* ניצחון / תיקו / הפסד */}
          <tr className="results-row">
            <td className="goals-cells" colSpan={2}>
              <div className="result-label">ניצחון</div>
              {boxes.slice(0,5).map((_,i)=>(<span key={"w"+i} className="box" />))}
              <div className="result-label">תיקו</div>
              {boxes.slice(0,5).map((_,i)=>(<span key={"d"+i} className="box" />))}
              <div className="result-label">הפסד</div>
              {boxes.slice(0,5).map((_,i)=>(<span key={"l"+i} className="box" />))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
