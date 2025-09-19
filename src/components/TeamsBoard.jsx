import React, { useMemo, useState, useCallback } from "react";
import { balanceTeams } from "../logic/balance";
import "./teamsBoard.css";

/*
  props:
    players: כל השחקנים (כולל שדות mustWith/notWith/rating/playing)
    numTeams: מספר קבוצות
    onTeamsChange(teams): קולבק לשמירת הקבוצות (לניהול מחזור/הדפסה)
*/
export default function TeamsBoard({ players, numTeams, onTeamsChange }) {
  const [hideRatings, setHideRatings] = useState(false);
  const [seed, setSeed] = useState(0); // לשינוי תוצאה בכל "עשה כוחות"

  const playable = useMemo(() => players.filter(p => p.playing), [players]);

  const teams = useMemo(() => {
    const t = balanceTeams(players, numTeams, { runs: 14 + (seed % 7) });
    onTeamsChange?.(t);
    return t;
  }, [players, numTeams, seed, onTeamsChange]);

  // סך מסומנים
  const totalSelected = playable.length;

  const reshuffle = () => setSeed(s => s + 1);

  // DnD פשוט: גרירת שם שחקן מקבוצה -> רשימת השחקנים -> הסרה
  const [floatingRemove, setFloatingRemove] = useState(null);
  const handleDragStart = (p) => setFloatingRemove(p.id);
  const handleDragEnd = () => setFloatingRemove(null);

  const removeFromTeam = useCallback((pid) => {
    // הפוך את השחקן ל-playing=false (הוא יחזור לרשימה)
    const idx = players.findIndex(p => p.id === pid);
    if (idx !== -1) {
      players[idx] = { ...players[idx], playing: false };
      // טריגר רינדור מחדש (בהקשר שלך – סטייט גלובלי/Redux/Context)
      setSeed(s => s + 1);
    }
  }, [players]);

  return (
    <div className="teams-board">
      <div className="teams-toolbar">
        <div className="counter">מסומנים: <strong>{totalSelected}</strong></div>
        <button className="btn" onClick={() => setHideRatings(v => !v)}>
          {hideRatings ? "הצג ציונים (בקבוצות)" : "הסתר ציונים (בקבוצות)"}
        </button>
        <button className="btn primary" onClick={reshuffle}>עשה כוחות</button>
      </div>

      {/* פריסה: עד 4 קבוצות בשורה, ואם 5+ – ייפתחו לשתי שורות בלי גלילה */}
      <div
        className="teams-grid"
        style={{ gridTemplateColumns: `repeat(${Math.min(4, numTeams)}, 1fr)` }}
      >
        {teams.map(team => (
          <div key={team.id} className="team-card">
            <div className="team-header">
              <div>קבוצה {team.id}</div>
              <div className="team-meta">
                ממוצע: {team.avg.toFixed(2)} · שחקנים: {team.players.length}
              </div>
            </div>
            <ul className="players">
              {team.players
                .sort((a,b)=>b.rating-a.rating) // תמיד לסדר יורד
                .map(p => (
                <li
                  key={p.id}
                  draggable
                  onDragStart={() => handleDragStart(p)}
                  onDragEnd={handleDragEnd}
                  title="גרור החוצה כדי להסיר"
                >
                  <span className="handle">⋮⋮</span>
                  <span className="name">{p.name}</span>
                  {!hideRatings && (
                    <span className="rating">{p.rating}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* אזור השלכה שמסיר שחקן מהקבוצה (גרירה אל הפס) */}
      <div
        className="drop-remove"
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => floatingRemove && removeFromTeam(floatingRemove)}
      >
        גרור שחקן לכאן כדי להסיר אותו מהקבוצה
      </div>
    </div>
  );
}
