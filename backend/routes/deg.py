"""
routes/deg.py
Handles DEG CSV upload, parsing, and returning structured results to the frontend.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
import csv
import io

router = APIRouter(prefix="/deg", tags=["DEG Analysis"])

# FIX 14: Default fc_threshold was 0.5 here but 1.0 in parseCSV.js classifyGene().
#          Same data pipeline, different defaults → mismatched up/down counts between
#          the upload path and the GEO pipeline path. Unified to 1.0 across both.
DEFAULT_FC_THRESHOLD = 1.0
DEFAULT_P_THRESHOLD  = 0.05


def _decode_content(raw_bytes: bytes) -> str:
    # FIX 16: Older GEO exports are often latin-1/windows-1252 encoded.
    #          Falling back gracefully avoids a cryptic 400 error.
    for encoding in ("utf-8", "latin-1"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode file — unsupported encoding.")


def parse_deg_csv(content: str) -> list[dict]:
    """
    Parse the DEG results CSV produced by limma/edgeR R pipeline.
    Expected columns: logFC, AveExpr, t, P.Value, adj.P.Val, B, GeneSymbol
    """
    reader = csv.DictReader(io.StringIO(content))

    # FIX 13: Detect completely missing critical columns up-front and raise a clear
    #          error instead of silently defaulting every gene's adj_p to 1 (all "ns").
    if reader.fieldnames:
        missing = [c for c in ("GeneSymbol", "logFC", "adj.P.Val")
                   if c not in reader.fieldnames]
        if missing:
            raise ValueError(
                f"Missing required column(s): {', '.join(missing)}. "
                "Expected: GeneSymbol, logFC, AveExpr, t, P.Value, adj.P.Val, B"
            )

    genes = []

    for row in reader:
        gene_symbol = row.get("GeneSymbol", "").strip().strip('"')
        if not gene_symbol or gene_symbol.upper() == "NA":
            continue

        try:
            # FIX 13 (continued): float("") raises ValueError — caught below and row
            #          is skipped, which is correct. But we use or "0"/"1" fallbacks
            #          only for non-critical columns so the skip only happens when
            #          truly unparseable critical values are encountered.
            logfc  = float(row.get("logFC",     "") or 0)
            ave    = float(row.get("AveExpr",   "") or 0)
            t_stat = float(row.get("t",         "") or 0)
            pval   = float(row.get("P.Value",   "") or 1)
            adj_p  = float(row.get("adj.P.Val", ""))   # no fallback — blank = skip row
            b_stat = float(row.get("B",         "") or 0)
        except (ValueError, TypeError):
            continue

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
                  fc_threshold: float = DEFAULT_FC_THRESHOLD,
                  p_threshold:  float = DEFAULT_P_THRESHOLD) -> str:
    # FIX 14: fc_threshold default changed from 0.5 → 1.0 to match parseCSV.js.
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
    return {"total": len(genes), "up": up, "down": down, "ns": ns}


@router.post("/upload")
async def upload_deg_file(file: UploadFile = File(...)):
    """
    Accepts a DEG results CSV file and returns parsed gene data + summary.
    """
    if not file.filename.endswith((".csv", ".tsv")):
        raise HTTPException(status_code=400, detail="Only .csv or .tsv files are supported.")

    try:
        raw_bytes = await file.read()
        content   = _decode_content(raw_bytes)   # FIX 16: encoding-aware decode
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read file.")

    try:
        genes = parse_deg_csv(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

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
    # FIX 15: Query/body params alongside File() in a multipart request MUST be
    #          declared with Form() — plain type annotations are not parsed by FastAPI
    #          from multipart/form-data, causing 422 Unprocessable Entity errors.
    fc_threshold: float = Form(DEFAULT_FC_THRESHOLD),
    p_threshold:  float = Form(DEFAULT_P_THRESHOLD),
):
    """
    Re-parses and re-classifies genes with custom thresholds.
    """
    try:
        raw_bytes = await file.read()
        content   = _decode_content(raw_bytes)   # FIX 16
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read file.")

    try:
        genes = parse_deg_csv(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

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