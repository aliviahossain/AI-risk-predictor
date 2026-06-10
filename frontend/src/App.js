import { useState } from "react";
import UploadPage  from "./pages/UploadPage";
import GeoPage     from "./pages/GeoPage";
import ResultsPage from "./pages/ResultsPage";
import "./App.css";

export default function App() {
  const [genes,    setGenes]    = useState(null);
  const [filename, setFilename] = useState("");
  const [jobId,    setJobId]    = useState(null);
  const [viewMode, setViewMode] = useState("upload");

  const handleDataLoaded = (parsedGenes, name, jid = null) => {
    setGenes(parsedGenes);
    setFilename(name);
    setJobId(jid);
  };

  const handleReset = () => {
    setGenes(null);
    setFilename("");
    setJobId(null);
    setViewMode("upload");
  };

  return genes ? (
    <ResultsPage genes={genes} filename={filename} jobId={jobId} onReset={handleReset} />
  ) : (
    <div className="App">
      <div className="app-modebar">
        <button
          className={`app-modebtn ${viewMode === "upload" ? "active" : ""}`}
          onClick={() => setViewMode("upload")}
        >
          Upload file
        </button>
        <button
          className={`app-modebtn ${viewMode === "geo" ? "active" : ""}`}
          onClick={() => setViewMode("geo")}
        >
          Use GEO ID
        </button>
      </div>
      {viewMode === "geo" ? (
        <GeoPage onAnalysisComplete={handleDataLoaded} />
      ) : (
        <UploadPage onDataLoaded={handleDataLoaded} />
      )}
    </div>
  );
}