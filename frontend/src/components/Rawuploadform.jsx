import React, { useState } from "react";
import { parseCSV } from "../utils/parseCSV";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function RawUploadForm({ onAnalysisComplete, onHeatmapGenerated }) {
  const [file, setFile] = useState(null);
  const [label, setLabel] = useState("");
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
        throw new Error(errorData.detail || "Failed to poll pipeline status.");
      }

      const statusData = await response.json();
      if (statusData.status === "done") {
        return statusData;
      }
      if (statusData.status === "error") {
        const message = statusData.step || statusData.errors?.join("; ") || "Pipeline failed.";
        throw new Error(message);
      }

      setStatus(`Pipeline ${statusData.status}: ${statusData.step}`);
      await wait(2000);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setError("");
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Uploading file...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      // Falls back to "UPLOAD" server-side if left blank — purely a naming
      // label for output files, does NOT trigger a GEO lookup.
      formData.append("label", label.trim() || "UPLOAD");

      const response = await fetch("http://localhost:8000/geo/upload-raw", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to start pipeline from uploaded file.");
      }

      const { job_id: jobId, geo_id: resolvedLabel } = await response.json();
      setStatus("Pipeline queued. Polling status...");

      await pollJobStatus(jobId);
      setStatus("Pipeline complete. Downloading results...");

      const csvResponse = await fetch(`http://localhost:8000/geo/download/${jobId}`);
      if (!csvResponse.ok) {
        const errorData = await csvResponse.json().catch(() => ({}));
        throw new Error(errorData.detail || "Unable to download results.");
      }

      const csvText = await csvResponse.text();
      const genes = parseCSV(csvText);
      if (genes.length === 0) {
        throw new Error("Pipeline ran but produced no valid genes. Check your file's format.");
      }

      if (onHeatmapGenerated) {
        onHeatmapGenerated(`http://localhost:8000/geo/heatmap/${jobId}`);
      }

      setStatus("Results ready.");
      onAnalysisComplete(genes, `${resolvedLabel || "upload"}.csv`, jobId);
    } catch (err) {
      console.error(err);
      setStatus("");
      setError(err.message || "An unknown error occurred while processing the uploaded file.");
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
          placeholder="Optional label, e.g. GSE280402"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="rp-input-group">
        <input
          type="file"
          className="rp-input-field"
          accept=".csv,.tsv,.txt,.gz"
          onChange={handleFileChange}
          disabled={loading}
          required
        />
        <button type="submit" className="rp-submit-btn" disabled={loading || !file}>
          {loading ? "Processing..." : "Upload & Run Pipeline"}
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