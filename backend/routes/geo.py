"""
routes/geo.py
Accepts a GEO ID, runs the R pipeline as a subprocess,
and streams real-time progress back to the frontend.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import subprocess
import threading
import uuid
import os
import json

router = APIRouter(prefix="/geo", tags=["GEO Pipeline"])

UPLOAD_DIR  = "uploads"
R_SCRIPT    = os.path.join(os.path.dirname(__file__), "..", "analysis", "core_deg_engine.R")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# In-memory job tracker
jobs: dict = {}


class GEORequest(BaseModel):
    geo_id: str


def run_r_pipeline(job_id: str, geo_id: str, job_dir: str):
    """Runs the R script in a background thread and tracks progress."""
    jobs[job_id]["status"] = "running"
    jobs[job_id]["log"]    = []

    try:
        process = subprocess.Popen(
            ["Rscript", R_SCRIPT, geo_id, job_dir],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        for line in process.stdout:
            line = line.rstrip()
            jobs[job_id]["log"].append(line)

            # Update step status based on log output
            if "STEP 1" in line:
                jobs[job_id]["step"] = "Downloading GEO metadata"
            elif "STEP 2" in line:
                jobs[job_id]["step"] = "Downloading count data"
            elif "STEP 3" in line:
                jobs[job_id]["step"] = "Reading count matrix"
            elif "STEP 4" in line:
                jobs[job_id]["step"] = "Assigning groups"
            elif "STEP 5" in line:
                jobs[job_id]["step"] = "Running DGE (voom + limma)"
            elif "STEP 6" in line:
                jobs[job_id]["step"] = "Exporting results"
            elif "STEP 7" in line:
                jobs[job_id]["step"] = "Generating heatmap"
            elif "STEP 8" in line:
                jobs[job_id]["step"] = "Finalizing"
            elif "ERROR" in line:
                jobs[job_id]["errors"].append(line)

        process.wait()

        if process.returncode != 0:
            jobs[job_id]["status"] = "error"
            jobs[job_id]["step"]   = "Pipeline failed"
            return

        # Read summary JSON produced by R
        summary_path = os.path.join(job_dir, "pipeline_summary.json")
        if os.path.exists(summary_path):
            with open(summary_path) as f:
                jobs[job_id]["summary"] = json.load(f)

        # Find the full CSV path
        full_csv = os.path.join(job_dir, f"{geo_id}_DEGs_Full.csv")
        if os.path.exists(full_csv):
            jobs[job_id]["csv_path"]    = full_csv
            jobs[job_id]["csv_filename"] = f"{geo_id}_DEGs_Full.csv"

        heatmap = os.path.join(job_dir, f"{geo_id}_Top28_Heatmap.png")
        if os.path.exists(heatmap):
            jobs[job_id]["heatmap_path"] = heatmap

        jobs[job_id]["status"] = "done"
        jobs[job_id]["step"]   = "Complete"

    except FileNotFoundError:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["step"]   = "Rscript not found — is R installed?"
        jobs[job_id]["errors"].append("Rscript executable not found. Install R from https://cran.r-project.org")
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["step"]   = str(e)
        jobs[job_id]["errors"].append(str(e))


@router.post("/run")
def run_geo_pipeline(req: GEORequest):
    """
    Start the R pipeline for a given GEO ID.
    Returns a job_id to poll for status.
    """
    geo_id = req.geo_id.strip().upper()

    # Basic validation
    if not geo_id.startswith("GSE"):
        raise HTTPException(status_code=400, detail="GEO ID must start with 'GSE' (e.g. GSE280402)")

    job_id  = str(uuid.uuid4())[:8]
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    jobs[job_id] = {
        "job_id":  job_id,
        "geo_id":  geo_id,
        "status":  "queued",
        "step":    "Starting R pipeline",
        "log":     [],
        "errors":  [],
        "summary": None,
    }

    # Run in background thread so API doesn't block
    thread = threading.Thread(
        target=run_r_pipeline,
        args=(job_id, geo_id, job_dir),
        daemon=True
    )
    thread.start()

    return {"job_id": job_id, "geo_id": geo_id, "message": "Pipeline started"}


@router.get("/status/{job_id}")
def get_status(job_id: str):
    """Poll this endpoint to get pipeline progress."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    return {
        "job_id":  job_id,
        "geo_id":  job["geo_id"],
        "status":  job["status"],   # queued | running | done | error
        "step":    job["step"],
        "errors":  job["errors"],
        "summary": job.get("summary"),
        "log":     job["log"][-20:],  # last 20 log lines
        "csv_filename": job.get("csv_filename"),
    }


@router.get("/download/{job_id}")
def download_csv(job_id: str):
    """Download the full DEG results CSV produced by the R pipeline."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    csv_path = jobs[job_id].get("csv_path")
    if not csv_path or not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="CSV not ready yet")

    return FileResponse(
        path=csv_path,
        filename=jobs[job_id]["csv_filename"],
        media_type="text/csv"
    )


@router.get("/heatmap/{job_id}")
def get_heatmap(job_id: str):
    """Serve the heatmap PNG generated by the R pipeline."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    heatmap_path = jobs[job_id].get("heatmap_path")
    if not heatmap_path or not os.path.exists(heatmap_path):
        raise HTTPException(status_code=404, detail="Heatmap not ready yet")

    return FileResponse(path=heatmap_path, media_type="image/png")