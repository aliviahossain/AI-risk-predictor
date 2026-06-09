"""
routes/deg.py
Handles DEG CSV upload, parsing, and returning structured results to the frontend.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import csv
import io

router = APIRouter(prefix="/deg", tags=["DEG Analysis"])


def parse_deg_csv(content: str) -> list[dict]:
    """
    Parse the DEG results CSV produced by limma/edgeR R pipeline.
    Expected columns: logFC, AveExpr, t, P.Value, adj.P.Val, B, GeneSymbol
    """
    reader = csv.DictReader(io.StringIO(content))
    genes = []

    for row in reader:
        gene_symbol = row.get("GeneSymbol", "").strip().strip('"')

        # Skip rows with no gene symbol or NA
        if not gene_symbol or gene_symbol.upper() == "NA":
            continue

        try:
            logfc   = float(row.get("logFC",     0))
            ave     = float(row.get("AveExpr",   0))
            t_stat  = float(row.get("t",         0))
            pval    = float(row.get("P.Value",   1))
            adj_p   = float(row.get("adj.P.Val", 1))
            b_stat  = float(row.get("B",         0))
        except (ValueError, TypeError):
            continue

        # Classify gene
        regulation = classify_gene(logfc, adj_p)

        genes.append({
            "geneSymbol": gene_symbol,
            "logFC":      round(logfc,  6),
            "aveExpr":    round(ave,    6),
            "tStat":      round(t_stat, 6),
            "pValue":     pval,
            "adjPVal":    adj_p,
            "bStat":      round(b_stat, 6),
            "type":       regulation,
        })

    return genes


def classify_gene(logfc: float, adj_pval: float,
                  fc_threshold: float = 0.5,
                  p_threshold:  float = 0.05) -> str:
    if adj_pval > p_threshold:
        return "ns"
    if logfc >= fc_threshold:
        return "up"
    if logfc <= -fc_threshold:
        return "down"
    return "ns"


def get_summary(genes: list[dict]) -> dict:
    up   = sum(1 for g in genes if g["type"] == "up")
    down = sum(1 for g in genes if g["type"] == "down")
    ns   = sum(1 for g in genes if g["type"] == "ns")
    return {
        "total": len(genes),
        "up":    up,
        "down":  down,
        "ns":    ns,
    }


@router.post("/upload")
async def upload_deg_file(file: UploadFile = File(...)):
    """
    Accepts a DEG results CSV file and returns parsed gene data + summary.
    """
    # Validate file type
    if not file.filename.endswith((".csv", ".tsv")):
        raise HTTPException(
            status_code=400,
            detail="Only .csv or .tsv files are supported."
        )

    # Read file content
    try:
        raw_bytes = await file.read()
        content   = raw_bytes.decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read file. Ensure it is UTF-8 encoded.")

    # Parse genes
    genes = parse_deg_csv(content)

    if len(genes) == 0:
        raise HTTPException(
            status_code=422,
            detail="No valid genes found. Check that your file has the correct columns: "
                   "GeneSymbol, logFC, AveExpr, t, P.Value, adj.P.Val, B"
        )

    summary = get_summary(genes)

    return JSONResponse({
        "filename": file.filename,
        "genes":    genes,
        "summary":  summary,
        "message":  f"Successfully parsed {len(genes)} genes."
    })


@router.post("/filter")
async def filter_genes(
    file:         UploadFile = File(...),
    fc_threshold: float = 0.5,
    p_threshold:  float = 0.05,
):
    """
    Re-parses and re-classifies genes with custom thresholds.
    """
    try:
        raw_bytes = await file.read()
        content   = raw_bytes.decode("utf-8")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read file.")

    genes = parse_deg_csv(content)

    # Re-classify with custom thresholds
    for g in genes:
        g["type"] = classify_gene(g["logFC"], g["adjPVal"], fc_threshold, p_threshold)

    summary = get_summary(genes)

    return JSONResponse({
        "genes":   genes,
        "summary": summary,
        "thresholds": {
            "fc_threshold": fc_threshold,
            "p_threshold":  p_threshold,
        }
    })