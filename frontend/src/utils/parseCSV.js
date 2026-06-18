export function parseCSV(text) {
  if (!text || typeof text !== "string") return [];

  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const rawHeaders = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.length < 2) continue;

    const row = {};
    rawHeaders.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx].replace(/"/g, "").trim() : "";
    });

    const gene = row["GeneSymbol"];
    if (!gene || gene === "NA" || gene === "") continue;

    const logFC = parseFloat(row["logFC"]);
    // FIX: Use nullish coalescing correctly — row[key] can be "" (falsy but valid),
    // so prefer explicit undefined check rather than ?? on the parsed float.
    const adjP = parseFloat(row["adj.P.Val"] !== undefined && row["adj.P.Val"] !== ""
      ? row["adj.P.Val"]
      : row["padj"] ?? "");
    const pVal = parseFloat(row["P.Value"] !== undefined && row["P.Value"] !== ""
      ? row["P.Value"]
      : row["pvalue"] ?? "");
    const ave  = parseFloat(row["AveExpr"] !== undefined && row["AveExpr"] !== ""
      ? row["AveExpr"]
      : row["baseMean"] ?? "");
    const t    = parseFloat(row["t"] !== undefined && row["t"] !== ""
      ? row["t"]
      : row["stat"] ?? "");
    const b    = parseFloat(row["B"] ?? "");

    if (!isFinite(logFC) || !isFinite(adjP)) continue;

    // FIX: adjPVal must be clamped to [0,1]; negative or >1 values are invalid
    if (adjP < 0 || adjP > 1) continue;

    rows.push({
      id:         i,
      geneSymbol: gene,
      logFC,
      aveExpr:    isFinite(ave) ? ave : 0,
      tStat:      isFinite(t)   ? t   : 0,
      pValue:     isFinite(pVal) && pVal > 0 ? pVal : 1,
      adjPVal:    adjP,
      bStat:      isFinite(b)   ? b   : 0,
    });
  }
  return rows;
}

/** RFC-4180-aware CSV line splitter (handles quoted commas and escaped quotes). */
function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Classify a single gene as "up", "down", or "ns".
 * Uses adj.P.Val for significance (not raw P.Value).
 */
// FIX: Added null guard for gene object
export function classifyGene(gene, fcThreshold = 1.0, pThreshold = 0.05) {
  if (!gene || !isFinite(gene.adjPVal) || gene.adjPVal > pThreshold) return "ns";
  if (gene.logFC >=  fcThreshold) return "up";
  if (gene.logFC <= -fcThreshold) return "down";
  return "ns";
}

/**
 * Return aggregate counts for up/down/ns genes.
 */
// FIX: Added Array.isArray guard to prevent crash on non-array input
export function getSummary(genes, fcThreshold = 1.0, pThreshold = 0.05) {
  if (!Array.isArray(genes)) return { total: 0, up: 0, down: 0, ns: 0 };
  let up = 0, down = 0;

  for (let i = 0; i < genes.length; i++) {
    const cls = classifyGene(genes[i], fcThreshold, pThreshold);
    if (cls === "up")   up++;
    else if (cls === "down") down++;
  }

  return { total: genes.length, up, down, ns: genes.length - up - down };
}

/**
 * Compute display ranges and suggest sensible default thresholds.
 */
export function getDataRange(genes) {
  if (!genes || genes.length === 0) {
    return { fcMin: -1, fcMax: 1, fcAbsMax: 1, negLogMax: 5,
             suggestedFC: 1.0, suggestedP: 0.05 };
  }

  let fcMin = Infinity, fcMax = -Infinity, fcAbsMax = 0, negLogMax = 0;
  const absValues  = [];
  const adjPValues = [];

  for (let i = 0; i < genes.length; i++) {
    const { logFC, adjPVal } = genes[i];

    if (!isFinite(logFC)) continue;

    if (logFC < fcMin) fcMin = logFC;
    if (logFC > fcMax) fcMax = logFC;

    const absFC = logFC < 0 ? -logFC : logFC;
    if (absFC > fcAbsMax) fcAbsMax = absFC;
    absValues.push(absFC);

    if (isFinite(adjPVal) && adjPVal > 0) {
      const nl = -Math.log10(adjPVal);
      if (nl > negLogMax) negLogMax = nl;
      adjPValues.push(adjPVal);
    }
  }

  if (!isFinite(fcMin)) fcMin = -1;
  if (!isFinite(fcMax)) fcMax = 1;

  // FIX: Clone arrays before sorting to avoid in-place mutation side-effects
  const sortedAbs   = [...absValues].sort((a, b) => a - b);
  const p10idx      = Math.max(0, Math.floor(sortedAbs.length * 0.10));
  const rawFC       = sortedAbs.length > 0 ? sortedAbs[p10idx] : 1.0;
  const suggestedFC = parseFloat(Math.max(0.5, rawFC).toFixed(2));

  const sortedAdjP   = [...adjPValues].sort((a, b) => a - b);
  const countBelow05 = sortedAdjP.filter((p) => p <= 0.05).length;
  const suggestedP   =
    countBelow05 > 0
      ? 0.05
      : sortedAdjP.length > 0
        ? parseFloat(
            Math.min(
              sortedAdjP[Math.floor(sortedAdjP.length * 0.10)],
              0.99
            ).toFixed(4)
          )
        : 0.05;

  return { fcMin, fcMax, fcAbsMax, negLogMax, suggestedFC, suggestedP };
}

/** Lightweight memoisation wrapper. */
export function memoize(fn) {
  let lastArgs = null;
  let lastResult = null;

  return function (...args) {
    if (
      lastArgs !== null &&
      args.length === lastArgs.length &&
      args.every((a, i) => a === lastArgs[i])
    ) {
      return lastResult;
    }
    lastResult = fn(...args);
    lastArgs = args;
    return lastResult;
  };
}

export const memoGetSummary   = memoize(getSummary);
export const memoGetDataRange = memoize(getDataRange);