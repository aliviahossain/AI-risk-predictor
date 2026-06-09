import { useState } from "react";
import UploadPage  from "./pages/UploadPage";
import ResultsPage from "./pages/ResultsPage";

export default function App() {
  const [genes,    setGenes]    = useState(null);
  const [filename, setFilename] = useState("");

  const handleDataLoaded = (parsedGenes, name) => {
    setGenes(parsedGenes);
    setFilename(name);
  };

  const handleReset = () => {
    setGenes(null);
    setFilename("");
  };

  return genes
    ? <ResultsPage genes={genes} filename={filename} onReset={handleReset} />
    : <UploadPage  onDataLoaded={handleDataLoaded} />;
}