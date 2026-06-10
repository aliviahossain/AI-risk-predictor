import React, { useState } from "react";
import GeoFetchForm from "../components/GeoFetchForm";
import HeatmapViewer from "../components/HeatmapViewer";
import "./GeoPage.css";

export default function GeoPage({ onAnalysisComplete }) {
  const [heatmapUrl, setHeatmapUrl] = useState(null);

  const handleFetchSuccess = (data, filename, jobId) => {
    // Pass the finalized pipeline dataset details back to App.js state tree
    onAnalysisComplete(data, filename, jobId);
  };

  return (
    <div className="rp-root">
      <main className="rp-main">
        {/* Form Placement Card */}
        <div className="rp-geo-card">
          <h2 className="rp-geo-title">NCBI GEO Ingestion Portal</h2>
          <p className="rp-geo-sub">
            Input a valid Gene Expression Omnibus Accession tracking ID to fetch expression datasets and run cross-platform linear transformations.
          </p>
          <GeoFetchForm onAnalysisComplete={handleFetchSuccess} onHeatmapGenerated={setHeatmapUrl} />
        </div>

        {/* Real-time Heatmap Preview Placement */}
        {heatmapUrl && (
          <HeatmapViewer imageUrl={heatmapUrl} />
        )}
      </main>
    </div>
  );
}