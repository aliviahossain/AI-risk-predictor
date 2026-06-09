/**
 * parseCSV.js - Parses DEG results CSV from limma/edgeR
 */

export function parseCSV(text) {
  const lines = text.trim().split("\n");
  const raw_headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.length < 2) continue;
    const row = {};
    raw_headers.forEach((h, idx) => {
      row[h] = values[idx]?.replace(/"/g, "").trim();
    });
    const gene = row["GeneSymbol"];
    if (!gene || gene === "NA" || gene === "") continue;

    const logFC  = parseFloat(row["logFC"])     ?? 0;
    const adjP   = parseFloat(row["adj.P.Val"]) ?? 1;
    const pVal   = parseFloat(row["P.Value"])   ?? 1;
    const ave    = parseFloat(row["AveExpr"])   ?? 0;
    const t      = parseFloat(row["t"])         ?? 0;
    const b      = parseFloat(row["B"])         ?? 0;

    if (isNaN(logFC) || isNaN(adjP)) continue;

    rows.push({
      id: i,
      geneSymbol: gene,
      logFC,
      aveExpr: ave,
      tStat:   t,
      pValue:  pVal,
      adjPVal: adjP,
      bStat:   b,
    });
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

export function classifyGene(gene, fcThreshold = 0.5, pThreshold = 0.05) {
  const absFC = Math.abs(gene.logFC);
  const sig   = gene.adjPVal <= pThreshold;
  if (!sig) return "ns";
  if (gene.logFC  >= fcThreshold) return "up";
  if (gene.logFC  <= -fcThreshold) return "down";
  return "ns";
}

export function getSummary(genes, fcThreshold = 0.5, pThreshold = 0.05) {
  const up   = genes.filter((g) => classifyGene(g, fcThreshold, pThreshold) === "up").length;
  const down = genes.filter((g) => classifyGene(g, fcThreshold, pThreshold) === "down").length;
  return { total: genes.length, up, down, ns: genes.length - up - down };
}

export function getDataRange(genes) {
  const logFCs = genes.map((g) => g.logFC).filter(isFinite);
  const adjPs  = genes.map((g) => g.adjPVal).filter((v) => v > 0 && isFinite(v));
  const maxNegLog = Math.max(...adjPs.map((p) => -Math.log10(p)));
  return {
    fcMin:      Math.min(...logFCs),
    fcMax:      Math.max(...logFCs),
    fcAbsMax:   Math.max(...logFCs.map(Math.abs)),
    negLogMax:  maxNegLog,
    // Suggest a sensible default FC threshold = 20th percentile of abs logFC
    suggestedFC: +(logFCs.map(Math.abs).sort((a,b)=>a-b)[Math.floor(logFCs.length * 0.8)] || 0.5).toFixed(2),
  };
}