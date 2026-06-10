import React, { useState } from "react";
import { parseCSV } from "../utils/parseCSV";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function GeoFetchForm({ onAnalysisComplete, onHeatmapGenerated }) {
  const [gseId, setGseId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const pollJobStatus = async (jobId) => {
    let attempts = 0;
    while (true) {
      if (attempts > 60) {
        throw new Error("Pipeline is taking too long. Please try again later or refresh the page.");
      }
      attempts += 1;

      const response = await fetch(`http://localhost:8000/geo/status/${jobId}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown status error" }));
        throw new Error(errorData.detail || "Failed to poll GEO pipeline status.");
      }

      const statusData = await response.json();
      if (statusData.status === "done") {
        return statusData;
      }
      if (statusData.status === "error") {
        const message = statusData.step || statusData.errors?.join("; ") || "GEO pipeline failed.";
        throw new Error(message);
      }

      setStatus(`Pipeline ${statusData.status}: ${statusData.step}`);
      await wait(2000);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const cleanId = gseId.trim();
    if (!cleanId) return;

    setLoading(true);
    setStatus("Starting GEO pipeline...");

    try {
      const response = await fetch("http://localhost:8000/geo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geo_id: cleanId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to start GEO pipeline.");
      }

      const { job_id: jobId } = await response.json();
      setStatus("GEO pipeline queued. Polling status...");

      await pollJobStatus(jobId);
      setStatus("Pipeline complete. Downloading results...");

      const csvResponse = await fetch(`http://localhost:8000/geo/download/${jobId}`);
      if (!csvResponse.ok) {
        const errorData = await csvResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || "Unable to download GEO results.");
      }

      const csvText = await csvResponse.text();
      const genes = parseCSV(csvText);
      if (genes.length === 0) {
        throw new Error("Downloaded GEO result CSV did not contain any valid genes.");
      }

      if (onHeatmapGenerated) {
        onHeatmapGenerated(`http://localhost:8000/geo/heatmap/${jobId}`);
      }

      setStatus("GEO results ready.");
      onAnalysisComplete(genes, `${cleanId}.csv`, jobId);
    } catch (err) {
      console.error(err);
      setStatus("");
      setError(err.message || "An unknown GEO pipeline error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleFormSubmit}>
      <div className="rp-input-group">
        <input
          type="text"
          className="rp-input-field"
          placeholder="e.g., GSE280402"
          value={gseId}
          onChange={(e) => setGseId(e.target.value)}
          disabled={loading}
          required
        />
        <button type="submit" className="rp-submit-btn" disabled={loading}>
          {loading ? "Processing..." : "Fetch & Run Pipeline"}
        </button>
      </div>
      
      {status && (
        <div className="rp-status-box">
          <span className="rp-status-spinner">🧬</span>
          {status}
        </div>
      )}
      {error && (
        <div className="rp-error-box">⚠ {error}</div>
      )}
    </form>
  );
}