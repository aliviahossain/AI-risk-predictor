import { classifyGene } from "../utils/parseCSV";

export default function DownloadButton({ genes, filename="DEG", fcThreshold=0.5, pThreshold=0.05 }) {
  const downloadCSV = () => {
    const header = "GeneSymbol,logFC,AveExpr,t,P.Value,adj.P.Val,B,Type\n";
    const rows = genes.map(g => {
      const type = classifyGene(g, fcThreshold, pThreshold);
      return `${g.geneSymbol},${g.logFC},${g.aveExpr},${g.tStat},${g.pValue},${g.adjPVal},${g.bStat},${type}`;
    }).join("\n");
    trigger(header+rows, "text/csv", `${filename}_annotated.csv`);
  };

  const downloadSigCSV = () => {
    const sig = genes.filter(g => classifyGene(g, fcThreshold, pThreshold) !== "ns");
    const header = "GeneSymbol,logFC,AveExpr,P.Value,adj.P.Val,Type\n";
    const rows = sig.map(g => {
      const type = classifyGene(g, fcThreshold, pThreshold);
      return `${g.geneSymbol},${g.logFC},${g.aveExpr},${g.pValue},${g.adjPVal},${type}`;
    }).join("\n");
    trigger(header+rows, "text/csv", `${filename}_significant_only.csv`);
  };

  const downloadSVG = () => {
    const svg = document.querySelector("svg");
    if (!svg) return alert("Switch to Volcano Plot tab first.");
    trigger(svg.outerHTML, "image/svg+xml", `${filename}_volcano.svg`);
  };

  const trigger = (content, type, name) => {
    const blob = new Blob([content], {type});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download=name; a.click();
    URL.revokeObjectURL(url);
  };

  const btn = (label, onClick, accent) => (
    <button onClick={onClick} style={{
      padding:"8px 16px", borderRadius:9, border:`1px solid ${accent}22`,
      background:`${accent}11`, color:accent, fontWeight:700, fontSize:12,
      cursor:"pointer", fontFamily:"'Plus Jakarta Sans',sans-serif",
      transition:"all 0.15s", whiteSpace:"nowrap"
    }}
    onMouseEnter={e=>{e.target.style.background=`${accent}22`;}}
    onMouseLeave={e=>{e.target.style.background=`${accent}11`;}}
    >{label}</button>
  );

  return (
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      {btn("⬇ Full CSV",     downloadCSV,    "#6366f1")}
      {btn("⬇ Sig. genes",   downloadSigCSV, "#16a34a")}
      {btn("🖼 Volcano SVG", downloadSVG,    "#f59e0b")}
    </div>
  );
}