// src/components/PrintModal.jsx
import React from "react";

/** רצועת תיבות סימון */
function SquareRow({ count = 6, size = 22, border = "#000" }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, ${size}px)`, gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            width: size,
            height: size,
            border: `1px solid ${border}`,
            borderRadius: 4,
            background: "#fff",
          }}
        />
      ))}
    </div>
  );
}

export default function PrintModal({ open, onClose, onPrint, dateStr, teams }) {
  if (!open) return null;

  const teamsCount = Array.isArray(teams) ? teams.length : 0;
  const cols = teamsCount >= 5 ? 3 : 2;       // 5–6 קבוצות = 3×2; אחרת 2×2
  const boxSize = teamsCount >= 5 ? 18 : 22;  // תיבות קטנות יותר כשיש הרבה קבוצות
  const fontBase = teamsCount >= 5 ? 12.5 : 14;

  const handlePrint = () => {
    try {
      onPrint && onPrint(); // משאיר התאמה עם השימוש הקיים
    } finally {
      window.print();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
      }}
      onMouseDown={onClose}
    >
      <div
        style={{
          background: "#0f172a",
          border: "1px solid #1d2a4a",
          borderRadius: 14,
          width: "min(1100px,96vw)",
          maxHeight: "92vh",
          overflow: "auto",
          padding: 16,
          color: "#dbeafe",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: "#6ee7b7" }}>תצוגת הדפסה</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{
                background: "transparent",
                color: "#a7f3d0",
                border: "1px solid #136c38",
                borderR
