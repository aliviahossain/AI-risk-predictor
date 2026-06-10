// parseCSV.js — safe for large datasets, no spread operator

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCSVLine(lines[0], delimiter).map((h) => h.replace(/"/g, "").trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i], delimiter);
    if (values.length < 2) continue;

    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || "").replace(/"/g, "").trim();
    });

    const gene = row["GeneSymbol"];
    if (!gene || gene === "NA" || gene === "") continue;

    const logFC  = parseFloat(row["logFC"]);
    const adjP   = parseFloat(row["adj.P.Val"]);
    if (isNaN(logFC) || isNaN(adjP)) continue;

    const pVal  = parseFloat(row["P.Value"]);
    const ave   = parseFloat(row["AveExpr"]);
    const t     = parseFloat(row["t"]);
    const b     = parseFloat(row["B"]);

    rows.push({
      id:        i,
      geneSymbol: gene,
      logFC,
      aveExpr:   isNaN(ave)  ? 0 : ave,
      tStat:     isNaN(t)    ? 0 : t,
      pValue:    isNaN(pVal) ? 1 : pVal,
      adjPVal:   adjP,
      bStat:     isNaN(b)    ? 0 : b,
    });
  }
  return rows;
}

function splitCSVLine(line, delimiter = ",") {
  const result = [];
  let current = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === delimiter && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function detectDelimiter(line) {
  const counts = {
    comma: (line.match(/,/g) || []).length,
    tab: (line.match(/\t/g) || []).length,
    semicolon: (line.match(/;/g) || []).length,
  };
  if (counts.tab > counts.comma && counts.tab >= counts.semicolon) return "\t";
  if (counts.semicolon > counts.comma) return ";";
  return ",";
}

export function classifyGene(gene, fcThreshold = 0.1, pThreshold = 0.05) {
  if (gene.adjPVal > pThreshold)    return "ns";
  if (gene.logFC  >=  fcThreshold)  return "up";
  if (gene.logFC  <= -fcThreshold)  return "down";
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
    return { fcMin:0, fcMax:0, fcAbsMax:0, negLogMax:0, suggestedFC:0.1, suggestedP:0.05 };
  }

  let fcMin = genes[0].logFC;
  let fcMax = genes[0].logFC;
  let fcAbsMax = 0;
  let negLogMax = 0;

  const absArr = [];
  const adjPArr = [];

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
      adjPArr.push(p);
    }
  }

  // Sort for percentile calculation
  absArr.sort((a, b) => a - b);
  adjPArr.sort((a, b) => a - b);

  // FC threshold = 10th percentile of abs values (catches 90% of genes)
  const p10 = Math.floor(absArr.length * 0.10);
  const suggestedFC = absArr.length > 0
    ? Math.max(0.01, parseFloat(absArr[p10].toFixed(3)))
    : 0.1;

  // P threshold = use 0.05 if any genes pass, else top 10% adj.P
  const below05 = adjPArr.filter((p) => p <= 0.05).length;
  const suggestedP = below05 > 5
    ? 0.05
    : adjPArr.length > 0
      ? Math.min(parseFloat(adjPArr[Math.floor(adjPArr.length * 0.1)].toFixed(4)), 0.99)
      : 0.05;

  return { fcMin, fcMax, fcAbsMax, negLogMax, suggestedFC, suggestedP };
}