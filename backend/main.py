from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uuid
import os
import shutil

app = FastAPI(title="Cancer Risk App API")

# Allow React frontend to talk to this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Folder to store uploaded files
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Track job statuses in memory (simple dict for now)
jobs = {}


@app.get("/")
def root():
    return {"message": "Cancer Risk App backend is running!"}


@app.post("/upload")
async def upload_files(
    t2d_file: UploadFile = File(...),
    cancer_file: UploadFile = File(...),
):
    # Validate file types
    for f in [t2d_file, cancer_file]:
        if not f.filename.endswith((".csv", ".tsv")):
            raise HTTPException(
                status_code=400,
                detail=f"File '{f.filename}' must be a .csv or .tsv file"
            )

    # Create a unique job ID
    job_id = str(uuid.uuid4())[:8]
    job_folder = os.path.join(UPLOAD_DIR, job_id)
    os.makedirs(job_folder, exist_ok=True)

    # Save uploaded files
    for filename, fileobj in [("t2d.csv", t2d_file), ("cancer.csv", cancer_file)]:
        file_path = os.path.join(job_folder, filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(fileobj.file, buffer)

    # Register job
    jobs[job_id] = {
        "status": "uploaded",
        "steps": {
            "validation": "done",
            "dge_analysis": "pending",
            "shared_genes": "pending",
            "enrichment": "pending",
            "ppi_network": "pending",
            "ai_risk": "pending",
            "report": "pending",
        }
    }

    return {"job_id": job_id, "message": "Files uploaded successfully!"}


@app.get("/status/{job_id}")
def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


@app.post("/run/{job_id}")
def run_pipeline(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    # For now just simulate pipeline running
    # Real pipeline modules will be plugged in here later
    jobs[job_id]["status"] = "running"
    jobs[job_id]["steps"]["dge_analysis"] = "running"

    return {"message": f"Pipeline started for job {job_id}"}


@app.get("/results/{job_id}")
def get_results(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    # Placeholder results — real data will come from pipeline later
    return {
        "job_id": job_id,
        "hub_genes": ["STAT3", "TP53", "IL6", "MYC", "EGFR"],
        "patient_risks": [
            {"patient_id": "P001", "risk": "High"},
            {"patient_id": "P002", "risk": "Low"},
            {"patient_id": "P003", "risk": "Medium"},
        ],
        "status": jobs[job_id]["status"]
    }