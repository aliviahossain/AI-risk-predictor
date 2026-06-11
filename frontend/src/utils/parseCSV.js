// parseCSV.js — safe for large datasets, no spread operator

export function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.length < 2) continue;

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || "").replace(/"/g, "").trim();
    });

    const gene = row["GeneSymbol"];
    if (!gene || gene === "NA" || gene === "") continue;

    const logFC = parseFloat(row["logFC"]);
    const adjP  = parseFloat(row["adj.P.Val"]);
    if (isNaN(logFC) || isNaN(adjP)) continue;

    const pVal = parseFloat(row["P.Value"]);
    const ave  = parseFloat(row["AveExpr"]);
    const t    = parseFloat(row["t"]);
    const b    = parseFloat(row["B"]);

    rows.push({
      id:         i,
      geneSymbol: gene,
      logFC,
      aveExpr:  isNaN(ave)  ? 0 : ave,
      tStat:    isNaN(t)    ? 0 : t,
      pValue:   isNaN(pVal) ? 1 : pVal,
      adjPVal:  adjP,
      bStat:    isNaN(b)    ? 0 : b,
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

export function classifyGene(gene, fcThreshold = 0.1, pThreshold = 0.05) {
  if (gene.adjPVal > pThreshold)   return "ns";
  if (gene.logFC  >=  fcThreshold) return "up";
  if (gene.logFC  <= -fcThreshold) return "down";
  return "ns";
}

export function getSummary(genes, fcThreshold = 0.1, pThreshold = 0.05) {
  let up = 0, down = 0;
  for (let i = 0; i < genes.length; i++) {
    const t = classifyGene(genes[i], fcThreshold, pThreshold);
    if (t === "up")   up++;
    if (t === "down") down++;
  }
  return { total: genes.length, up, down, ns: genes.length - up - down };
}

export function getDataRange(genes) {
  if (!genes || genes.length === 0) {
    return { fcMin:0, fcMax:0, fcAbsMax:1, negLogMax:5, suggestedFC:0.1, suggestedP:0.05 };
  }

  let fcMin = genes[0].logFC;
  let fcMax = genes[0].logFC;
  let fcAbsMax  = 0;
  let negLogMax = 0;
  const absArr  = [];

  for (let i = 0; i < genes.length; i++) {
    const g  = genes[i];
    const fc = g.logFC;
    const p  = g.adjPVal;

    if (!isFinite(fc)) continue;
    if (fc < fcMin) fcMin = fc;
    if (fc > fcMax) fcMax = fc;
    const absFC = fc < 0 ? -fc : fc;
    if (absFC > fcAbsMax) fcAbsMax = absFC;
    absArr.push(absFC);

    if (p > 0 && isFinite(p)) {
      const nl = -Math.log10(p);
      if (nl > negLogMax) negLogMax = nl;
    }
  }

  // FC threshold = 20th percentile of abs logFC values
  absArr.sort((a, b) => a - b);
  const p20idx      = Math.floor(absArr.length * 0.20);
  const suggestedFC = absArr.length > 0
    ? Math.max(0.01, parseFloat(absArr[p20idx].toFixed(3)))
    : 0.1;

  // ── P threshold is ALWAYS fixed at 0.05 ──────────────────────────────────
  // Never auto-calculate this — 0.05 is the universal scientific standard
  // A high adj.P dataset just means fewer significant genes, which is correct
  const suggestedP = 0.05;

  return { fcMin, fcMax, fcAbsMax, negLogMax, suggestedFC, suggestedP };
}