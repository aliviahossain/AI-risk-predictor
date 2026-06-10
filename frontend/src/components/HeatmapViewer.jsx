import React from "react";

export default function HeatmapViewer({ imageUrl }) {
  if (!imageUrl) return null;

  return (
    <div className="rp-heatmap-container">
      <h3 className="rp-geo-title" style={{ fontSize: "18px" }}>Calculated Micro-Array Profile Target Matrix</h3>
      <p className="rp-geo-sub" style={{ marginBottom: "12px" }}>
        Visual profiling layout representing the top 28 micro-array expression items passing structural {"P < 0.001"} thresholds.
      </p>
      <img 
        src={imageUrl} 
        alt="Micro-Array Target Expression Profile Map" 
        className="rp-heatmap-img"
        onError={(e) => {
          e.target.style.display = 'none';
          console.error("Static pipeline asset maps could not compile cleanly.");
        }}
      />
    </div>
  );
}