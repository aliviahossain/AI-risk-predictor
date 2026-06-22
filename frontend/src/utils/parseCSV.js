// parseCSV.js — fixed version

export function parseCSV(text) {
  if (!text || typeof text !== "string") return [];
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.length < 2) continue;

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").replace(/"/g, "").trim();
    });

    const gene = row["GeneSymbol"];
    if (!gene || gene === "NA" || gene === "") continue;

    const logFC = parseFloat(row["logFC"]);
    const adjP  = parseFloat(row["adj.P.Val"]);
    if (!isFinite(logFC) || !isFinite(adjP)) continue;
    // adjPVal must be a valid probability
    if (adjP < 0 || adjP > 1) continue;

    const pVal = parseFloat(row["P.Value"]);
    const ave  = parseFloat(row["AveExpr"]);
    const t    = parseFloat(row["t"]);
    const b    = parseFloat(row["B"]);

    rows.push({
      id:        i,
      geneSymbol: gene,
      logFC,
      aveExpr:  isFinite(ave)  ? ave  : 0,
      tStat:    isFinite(t)    ? t    : 0,
      pValue:   isFinite(pVal) && pVal > 0 ? pVal : 1,
      adjPVal:  adjP,
      bStat:    isFinite(b)    ? b    : 0,
    });
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = "";
    } else { current += ch; }
  }
  result.push(current);
  return result;
}

// pType: "adj" = use adj.P.Val (FDR), "raw" = use raw P.Value
export function classifyGene(gene, fcThreshold = 0.0, pThreshold = 0.05, pType = "adj") {
  const pVal = pType === "raw" ? gene.pValue : gene.adjPVal;
  if (!gene || !isFinite(pVal) || pVal > pThreshold) return "ns";
  if (fcThreshold > 0) {
    if (gene.logFC >=  fcThreshold) return "up";
    if (gene.logFC <= -fcThreshold) return "down";
    return "ns";
  }
  // fcThreshold = 0: classify by direction only
  return gene.logFC >= 0 ? "up" : "down";
}

export function getSummary(genes, fcThreshold = 0.0, pThreshold = 0.05, pType = "adj") {
  if (!Array.isArray(genes)) return { total: 0, up: 0, down: 0, ns: 0 };
  let up = 0, down = 0;
  for (let i = 0; i < genes.length; i++) {
    const cls = classifyGene(genes[i], fcThreshold, pThreshold, pType);
    if (cls === "up")   up++;
    if (cls === "down") down++;
  }
  return { total: genes.length, up, down, ns: genes.length - up - down };
}

export function getDataRange(genes) {
  if (!genes || genes.length === 0) {
    return { fcMin:-1, fcMax:1, fcAbsMax:1, negLogMax:5, suggestedFC:0, suggestedP:0.05 };
  }

  let fcMin = Infinity, fcMax = -Infinity, fcAbsMax = 0, negLogMax = 0;
  for (let i = 0; i < genes.length; i++) {
    const { logFC, adjPVal } = genes[i];
    if (!isFinite(logFC)) continue;
    if (logFC < fcMin) fcMin = logFC;
    if (logFC > fcMax) fcMax = logFC;
    const absFC = logFC < 0 ? -logFC : logFC;
    if (absFC > fcAbsMax) fcAbsMax = absFC;
    if (isFinite(adjPVal) && adjPVal > 0) {
      const nl = -Math.log10(adjPVal);
      if (nl > negLogMax) negLogMax = nl;
    }
  }

  if (!isFinite(fcMin)) fcMin = -1;
  if (!isFinite(fcMax)) fcMax = 1;

  return {
    fcMin, fcMax, fcAbsMax, negLogMax,
    // suggestedFC = 0 means "no FC filter by default — show all sig genes"
    suggestedFC: 0,
    suggestedP:  0.05,
  };
}