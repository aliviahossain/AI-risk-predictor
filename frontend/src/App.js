import { useState } from "react";
import UploadPage  from "./pages/UploadPage";
import ResultsPage from "./pages/ResultsPage";

export default function App() {
  const [genes,    setGenes]    = useState(null);
  const [filename, setFilename] = useState("");
  const [jobId,    setJobId]    = useState(null);

  const handleDataLoaded = (parsedGenes, name, jid = null) => {
    setGenes(parsedGenes);
    setFilename(name);
    setJobId(jid);
  };

  const handleReset = () => {
    setGenes(null);
    setFilename("");
    setJobId(null);
  };

  return genes
    ? <ResultsPage genes={genes} filename={filename} jobId={jobId} onReset={handleReset} />
    : <UploadPage  onDataLoaded={handleDataLoaded} />;
}