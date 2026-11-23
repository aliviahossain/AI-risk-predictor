"""
routes/geo.py
Accepts a GEO ID, runs the R pipeline as a subprocess,
and streams real-time progress back to the frontend.
"""

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import subprocess
import threading
import uuid
import os
import json
import shutil
import tarfile
import time
from pathlib import Path, PurePosixPath
import re

router = APIRouter(prefix="/geo", tags=["GEO Pipeline"])

UPLOAD_DIR = os.path.abspath(os.getenv("UPLOAD_DIR", "uploads"))
MAX_ACTIVE_PIPELINES = max(1, int(os.getenv("MAX_ACTIVE_PIPELINES", "1")))
MAX_UPLOAD_BYTES = max(1, int(os.getenv("MAX_UPLOAD_BYTES", str(100 * 1024 * 1024))))
MAX_EXTRACTED_BYTES = max(
    1, int(os.getenv("MAX_EXTRACTED_BYTES", str(512 * 1024 * 1024)))
)
JOB_RETENTION_HOURS = max(1, int(os.getenv("JOB_RETENTION_HOURS", "24")))
MAX_JOBS_PER_IP_PER_HOUR = max(1, int(os.getenv("MAX_JOBS_PER_IP_PER_HOUR", "5")))

# FIX 11: os.path.dirname(__file__) returns "" when the module is run from its
#          own directory, making the relative join resolve against CWD instead of
#          the actual file location. Wrap in os.path.abspath() to always get an
#          absolute, reliable path regardless of working directory.
#
# NOTE: path matches your project layout — backend/analysis/core_deg_engine.R
#       (this routes file lives at backend/routes/geo.py, hence the one "..").
R_SCRIPT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "analysis", "core_deg_engine.R")
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

# FIX 12: jobs dict is read from the API thread and written from background threads
#          simultaneously — a race condition. Protect all access with a Lock.
jobs: dict = {}
_jobs_lock = threading.Lock()
_job_requests: dict[str, list[float]] = {}


def cleanup_expired_jobs(now: float | None = None) -> None:
    """Remove completed jobs and their files after the configured retention."""
    cutoff = (time.time() if now is None else now) - JOB_RETENTION_HOURS * 3600
    expired_dirs = []

    with _jobs_lock:
        expired_ids = [
            job_id
            for job_id, job in jobs.items()
            if job.get("status") in {"done", "error"}
            and job.get("finished_at", float("inf")) < cutoff
        ]
        for job_id in expired_ids:
            job = jobs.pop(job_id)
            if job.get("job_dir"):
                expired_dirs.append(job["job_dir"])

    upload_root = Path(UPLOAD_DIR).resolve()
    for job_dir in expired_dirs:
        path = Path(job_dir).resolve()
        if path.parent == upload_root:
            shutil.rmtree(path, ignore_errors=True)

    if upload_root.is_dir():
        with _jobs_lock:
            active_ids = {
                job_id
                for job_id, job in jobs.items()
                if job.get("status") in {"queued", "running"}
            }
        for path in upload_root.iterdir():
            if (
                path.is_dir()
                and re.fullmatch(r"(?:[0-9a-f]{8}|[0-9a-f]{32})", path.name)
                and path.name not in active_ids
                and path.stat().st_mtime < cutoff
            ):
                shutil.rmtree(path, ignore_errors=True)


def _reserve_job(
    job_id: str, geo_id: str, job_dir: str, step: str, client_ip: str, source: str = "geo"
):
    """Enforce per-client and global concurrency limits before accepting a job."""
    now = time.time()
    with _jobs_lock:
        for ip, timestamps in list(_job_requests.items()):
            kept = [timestamp for timestamp in timestamps if now - timestamp < 3600]
            if kept:
                _job_requests[ip] = kept
            else:
                _job_requests.pop(ip, None)

        recent = [
            timestamp
            for timestamp in _job_requests.get(client_ip, [])
            if now - timestamp < 3600
        ]
        if len(recent) >= MAX_JOBS_PER_IP_PER_HOUR:
            raise HTTPException(
                status_code=429,
                detail="Too many analyses from this address. Try again in an hour.",
            )

        active = sum(
            job.get("status") in {"queued", "running"} for job in jobs.values()
        )
        if active >= MAX_ACTIVE_PIPELINES:
            raise HTTPException(
                status_code=429,
                detail="The analysis service is busy. Please try again later.",
            )

        recent.append(now)
        _job_requests[client_ip] = recent
        jobs[job_id] = {
            "job_id": job_id,
            "geo_id": geo_id,
            "source": source,
            "job_dir": job_dir,
            "status": "queued",
            "step": step,
            "log": [],
            "errors": [],
            "summary": None,
            "created_at": now,
        }


def _find_reusable_geo_job(geo_id: str) -> tuple[str, dict] | None:
    """
    Return a GEO-accession job for geo_id that is finished or still running, so
    repeat requests reuse it instead of re-running the R pipeline. Raw uploads
    are never shared: they hold one user's private data.
    """
    with _jobs_lock:
        candidates = [
            (job_id, job)
            for job_id, job in jobs.items()
            if job.get("source") == "geo"
            and job.get("geo_id") == geo_id
            and job.get("status") in {"queued", "running", "done"}
        ]
    for job_id, job in sorted(candidates, key=lambda c: c[1].get("created_at", 0), reverse=True):
        if job["status"] != "done" or os.path.exists(job.get("csv_path") or ""):
            return job_id, dict(job)
    return None


def _discard_reserved_job(job_id: str, job_dir: str) -> None:
    with _jobs_lock:
        jobs.pop(job_id, None)
    shutil.rmtree(job_dir, ignore_errors=True)


def _copy_upload_with_limit(file: UploadFile, destination: str) -> int:
    size = 0
    with open(destination, "wb") as output:
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"Upload exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
                )
            output.write(chunk)
    return size


def _extract_expression_files(archive_path: str, extract_dir: str) -> list[str]:
    allowed_ext = (".csv", ".tsv", ".txt", ".csv.gz", ".tsv.gz", ".txt.gz")
    candidates = []
    extracted_bytes = 0
    root = Path(extract_dir).resolve()

    with tarfile.open(archive_path, mode="r:*") as archive:
        for member in archive:
            if not member.isfile():
                continue

            member_path = PurePosixPath(member.name)
            if member_path.is_absolute() or ".." in member_path.parts:
                raise HTTPException(status_code=400, detail="Archive contains an unsafe path.")

            destination = (root / Path(*member_path.parts)).resolve()
            if destination != root and root not in destination.parents:
                raise HTTPException(status_code=400, detail="Archive contains an unsafe path.")

            if not member.name.lower().endswith(allowed_ext):
                continue
            if any(
                skip in Path(member.name).name.lower()
                for skip in ("readme", "soft", "family", "md5")
            ):
                continue

            extracted_bytes += member.size
            if extracted_bytes > MAX_EXTRACTED_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail="Archive expands beyond the configured extraction-size limit.",
                )

            source = archive.extractfile(member)
            if source is None:
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with source, open(destination, "wb") as output:
                shutil.copyfileobj(source, output)
            candidates.append(str(destination))

    return candidates


class GEORequest(BaseModel):
    geo_id: str


# Ordered (pattern, title, message, hint) rules mapping raw R / process output
# to a plain-language explanation. The first rule whose pattern matches any
# error or log line wins. "{source}" is replaced per mode (GEO vs upload).
_FAILURE_RULES = [
    (r"finished without writing a results table",
     "No results were produced",
     "The pipeline finished, but did not write a results table.",
     "Check the technical details below. If the problem persists, report it via the feedback form."),
    (r"ERROR metadata|cannot open URL|HTTP error 404|does not exist",
     "Could not retrieve this dataset from GEO",
     "NCBI GEO did not return metadata for this accession.",
     "Check that the GSE ID is correct and public, then try again. "
     "If it is correct, NCBI may be temporarily unavailable — retry in a few minutes."),
    (r"Could not resolve host|Timeout was reached|timed out|Connection (refused|reset)",
     "Could not reach NCBI GEO",
     "The server lost its connection while downloading data from NCBI.",
     "This is usually temporary. Please try again in a few minutes."),
    (r"Could not load expression data",
     "No usable expression matrix found",
     "{source} did not contain a gene-by-sample table of numeric values the pipeline could read.",
     "{source_hint}"),
    (r"valid samples\. Need >= 4",
     "Not enough samples",
     "After removing empty or constant columns, fewer than 4 samples were left. "
     "Differential expression needs at least 2 samples in each group.",
     "Make sure each column is one sample with numeric values, and that the file includes "
     "both case and control samples."),
    (r"ERROR (lmFit|eBayes|topTable)|No residual degrees of freedom",
     "The statistical model could not be fitted",
     "limma could not fit the case-vs-control model to this data.",
     "This usually means the case/control groups could not be detected, or one group has "
     "too few samples. Name sample columns so they include words like 'control' / 'normal' "
     "and 'case' / 'tumor' / 't2d'."),
    (r"there is no package called|Installing .* failed|package .* is not available",
     "Server is missing a required R package",
     "The analysis server is not fully set up.",
     "This is a problem on our side, not with your data. Please report it via the feedback form."),
    (r"cannot allocate vector|memory exhausted|Killed",
     "The dataset is too large to process",
     "The server ran out of memory while analysing this dataset.",
     "Try a smaller file (fewer genes or samples), or filter low-count genes before uploading."),
    (r"Rscript not found|R script not found",
     "Analysis engine unavailable",
     "The R analysis engine could not be started on the server.",
     "This is a problem on our side, not with your data. Please report it via the feedback form."),
]


def _classify_failure(lines: list[str], failed_step: str, upload_mode: bool) -> dict:
    """Turn raw pipeline output into a user-facing failure description."""
    source = "The uploaded file" if upload_mode else "This GEO series"
    source_hint = (
        "Upload a matrix with gene/probe IDs in the first column and one numeric column "
        "per sample (.csv, .tsv or .txt, optionally gzipped)."
        if upload_mode else
        "Some GEO series only provide raw sequencing reads or unusual file formats. "
        "Download a counts or expression matrix yourself and use the "
        "'Raw expression file' option instead."
    )
    text = "\n".join(lines)
    for pattern, title, message, hint in _FAILURE_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            break
    else:
        title = "The analysis stopped unexpectedly"
        message = f"The pipeline failed during the “{failed_step}” step." if failed_step else \
                  "The pipeline failed before it could start."
        hint = "Check the technical details below. If the problem persists, report it via the feedback form."
    fmt = {"source": source, "source_hint": source_hint}
    errors = [l for l in lines if _is_error_line(l)]
    return {
        "title": title,
        "message": message.format(**fmt),
        "hint": hint.format(**fmt),
        "step": failed_step,
        "details": errors[-5:] or lines[-5:],
    }


def _is_error_line(line: str) -> bool:
    # FIX 9: Only treat lines starting with "ERROR" as errors, not lines that
    #         merely contain the word. Also capture R's own "Error:" and
    #         "Error in f(...) :" prefixes from uncaught stop() calls.
    return line.startswith(("ERROR", "Error:", "Error in "))


def _fail_job(job_id: str, upload_mode: bool, extra: str | None = None) -> None:
    """Mark a job as failed and attach a classified, user-facing explanation."""
    with _jobs_lock:
        job = jobs[job_id]
        if extra:
            job["errors"].append(extra)
        failed_step = job.get("step", "")
        job["failure"] = _classify_failure(
            job["errors"] + job["log"][-40:], failed_step, upload_mode
        )
        job["status"] = "error"
        job["step"] = "Pipeline failed"
        job["finished_at"] = time.time()


def run_r_pipeline(job_id: str, geo_id: str, job_dir: str, raw_file_path: str | None = None):
    """Runs the R script in a background thread and tracks progress.

    raw_file_path: when provided, the R script skips the GEO download step
    entirely and reads this local file as the expression matrix (3rd-tab
    "upload raw GEO file" feature). When None, behaves exactly as before
    (downloads metadata + supplementary files for geo_id).
    """
    upload_mode = raw_file_path is not None

    with _jobs_lock:
        jobs[job_id]["status"] = "running"
        jobs[job_id]["log"]    = []

    cmd = ["Rscript", R_SCRIPT, geo_id, job_dir]
    if raw_file_path:
        cmd.append(raw_file_path)

    # FIX: step labels must exactly match the frontend's STEPS (GEO mode) /
    # RAW_STEPS (upload mode) arrays, or UploadPage.jsx's
    # `activeSteps.indexOf(jobStep)` returns -1 forever and the progress UI
    # never advances. Also extended to STEP 9, since core_deg_engine.R has
    # 9 numbered steps (the old 8-step script this was modeled on is gone).
    if upload_mode:
        step_labels = {
            "STEP 1": "Inspecting uploaded file",
            "STEP 2": "Selecting expression file",
            "STEP 3": "Reading count matrix",
            "STEP 4": "Cleaning matrix",
            "STEP 5": "Assigning groups",
            "STEP 6": "Running DGE (voom + limma)",
            "STEP 7": "Building results",
            "STEP 8": "Generating heatmap",
            "STEP 9": "Finalizing",
        }
    else:
        step_labels = {
            "STEP 1": "Downloading GEO metadata",
            "STEP 2": "Downloading count data",
            "STEP 3": "Reading count matrix",
            "STEP 4": "Cleaning matrix",
            "STEP 5": "Assigning groups",
            "STEP 6": "Running DGE (voom + limma)",
            "STEP 7": "Building results",
            "STEP 8": "Generating heatmap",
            "STEP 9": "Finalizing",
        }

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        for line in process.stdout:
            line = line.rstrip()
            with _jobs_lock:
                jobs[job_id]["log"].append(line)

                # Update step status based on log output
                matched_step = None
                for key, label in step_labels.items():
                    if key in line:
                        matched_step = label
                        break
                if matched_step:
                    jobs[job_id]["step"] = matched_step
                elif _is_error_line(line):
                    jobs[job_id]["errors"].append(line)

        process.wait()

        if process.returncode != 0:
            # A negative code means the process was killed by a signal; on
            # Linux that is almost always the OOM killer (SIGKILL).
            killed = process.returncode < 0 or process.returncode == 137
            _fail_job(job_id, upload_mode, "Killed (out of memory)" if killed else None)
            return

        # Read summary JSON produced by R
        summary_path = os.path.join(job_dir, "pipeline_summary.json")
        if os.path.exists(summary_path):
            with open(summary_path) as f:
                summary_data = json.load(f)
            with _jobs_lock:
                jobs[job_id]["summary"] = summary_data

        full_csv = os.path.join(job_dir, f"{geo_id}_DEGs_Full.csv")
        if not os.path.exists(full_csv):
            _fail_job(job_id, upload_mode, "ERROR: Pipeline finished without writing a results table")
            return
        with _jobs_lock:
            jobs[job_id]["csv_path"]     = full_csv
            jobs[job_id]["csv_filename"] = f"{geo_id}_DEGs_Full.csv"

        heatmap = os.path.join(job_dir, f"{geo_id}_Top28_Heatmap.png")
        if os.path.exists(heatmap):
            with _jobs_lock:
                jobs[job_id]["heatmap_path"] = heatmap

        with _jobs_lock:
            jobs[job_id]["status"] = "done"
            jobs[job_id]["step"]   = "Complete"
            jobs[job_id]["finished_at"] = time.time()

    # FIX 10: Distinguish "Rscript binary not found" from "R script path not found".
    #          Both raise FileNotFoundError from Popen, but for different reasons.
    except FileNotFoundError as e:
        err_msg = str(e)
        if "Rscript" in err_msg or "rscript" in err_msg.lower():
            step_msg = "ERROR: Rscript not found — is R installed? https://cran.r-project.org"
        else:
            step_msg = f"ERROR: R script not found at path: {R_SCRIPT}"
        _fail_job(job_id, upload_mode, step_msg)
    except Exception as e:
        _fail_job(job_id, upload_mode, f"ERROR: {e}")


@router.post("/run")
def run_geo_pipeline(req: GEORequest, request: Request):
    """
    Start the R pipeline for a given GEO ID.
    Returns a job_id to poll for status.
    """
    geo_id = req.geo_id.strip().upper()

    if not re.fullmatch(r"GSE[0-9]+", geo_id):
        raise HTTPException(
            status_code=400,
            detail="GEO ID must be a valid accession (e.g. GSE280402).",
        )

    cleanup_expired_jobs()
    reusable = _find_reusable_geo_job(geo_id)
    if reusable:
        job_id, job = reusable
        return {
            "job_id": job_id,
            "geo_id": geo_id,
            "cached": job["status"] == "done",
            "message": "Using cached results" if job["status"] == "done" else "Pipeline already running",
        }

    job_id  = uuid.uuid4().hex
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    client_ip = request.client.host if request.client else "unknown"
    _reserve_job(job_id, geo_id, job_dir, "Starting R pipeline", client_ip)
    try:
        os.makedirs(job_dir, exist_ok=True)
    except OSError:
        _discard_reserved_job(job_id, job_dir)
        raise

    try:
        thread = threading.Thread(
            target=run_r_pipeline,
            args=(job_id, geo_id, job_dir),
            daemon=True
        )
        thread.start()
    except RuntimeError:
        _discard_reserved_job(job_id, job_dir)
        raise HTTPException(status_code=503, detail="Could not start the analysis worker.")

    return {"job_id": job_id, "geo_id": geo_id, "cached": False, "message": "Pipeline started"}


@router.post("/upload-raw")
async def run_geo_pipeline_from_file(
    request: Request,
    file: UploadFile = File(...),
    # FIX: plain `label: str = "UPLOAD"` is NOT parsed by FastAPI from
    # multipart/form-data alongside a File() field — it must be declared with
    # Form() or the request fails validation (422) before this function body
    # even runs. The frontend also doesn't send `label` at all, so this must
    # have a usable default via Form(), not a bare Python default.
    label: str = Form("UPLOAD"),
):
    """
    Start the R pipeline against a raw, user-uploaded GEO expression file
    (counts matrix, microarray matrix, series-matrix-style file, or a GEO
    supplementary archive) instead of downloading from GEO. Skips STEP 1/2
    of the R pipeline entirely.

    `label` is just used for naming output files (e.g. "GSE12345" if known,
    or any short identifier) — it does not trigger a GEO lookup.
    """
    # FIX: match the frontend's actual accepted types (it advertises and
    # allows .tar/.tar.gz/.tgz archives too, not just flat tabular files).
    allowed_ext = (".csv", ".tsv", ".txt", ".csv.gz", ".tsv.gz", ".txt.gz",
                   ".tar", ".tar.gz", ".tgz")
    filename = file.filename or ""
    fname_lower = filename.lower()
    if not fname_lower.endswith(allowed_ext):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Expected one of: {', '.join(allowed_ext)}"
        )

    geo_id  = (label or "UPLOAD").strip().upper().replace(" ", "_") or "UPLOAD"
    if not re.fullmatch(r"[A-Z0-9_-]{1,32}", geo_id):
        raise HTTPException(
            status_code=400,
            detail="Label may contain only letters, numbers, underscores, and hyphens.",
        )
    cleanup_expired_jobs()
    job_id  = uuid.uuid4().hex
    job_dir = os.path.join(UPLOAD_DIR, job_id)
    client_ip = request.client.host if request.client else "unknown"
    _reserve_job(
        job_id, geo_id, job_dir, "Starting R pipeline (raw upload)", client_ip, source="upload"
    )
    try:
        os.makedirs(job_dir, exist_ok=True)
        # Use only the client filename's leaf component.
        saved_path = os.path.join(job_dir, os.path.basename(filename))
        _copy_upload_with_limit(file, saved_path)

        raw_path = saved_path
        if fname_lower.endswith((".tar", ".tar.gz", ".tgz")):
            extract_dir = os.path.join(job_dir, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            try:
                candidates = _extract_expression_files(saved_path, extract_dir)
            except (tarfile.TarError, OSError) as e:
                raise HTTPException(status_code=400, detail=f"Could not extract archive: {e}")

            if not candidates:
                raise HTTPException(
                    status_code=400,
                    detail="No usable expression file (.csv/.tsv/.txt) found inside the archive."
                )
            raw_path = candidates[0]
    except Exception:
        _discard_reserved_job(job_id, job_dir)
        raise

    try:
        thread = threading.Thread(
            target=run_r_pipeline,
            args=(job_id, geo_id, job_dir, raw_path),
            daemon=True
        )
        thread.start()
    except RuntimeError:
        _discard_reserved_job(job_id, job_dir)
        raise HTTPException(status_code=503, detail="Could not start the analysis worker.")

    return {"job_id": job_id, "geo_id": geo_id, "message": "Pipeline started from uploaded file"}


@router.get("/status/{job_id}")
def get_status(job_id: str):
    """Poll this endpoint to get pipeline progress."""
    cleanup_expired_jobs()
    with _jobs_lock:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        job = dict(jobs[job_id])  # snapshot to avoid holding lock during response serialization

    return {
        "job_id":       job_id,
        "geo_id":       job["geo_id"],
        "status":       job["status"],
        "step":         job["step"],
        "errors":       job["errors"],
        "failure":      job.get("failure"),
        "summary":      job.get("summary"),
        "log":          job["log"][-20:],
        "csv_filename": job.get("csv_filename"),
    }


# Job outputs are immutable once written, so clients may cache them until the
# job expires. "private" keeps shared proxies from storing users' results.
_RESULT_CACHE_HEADERS = {"Cache-Control": f"private, max-age={JOB_RETENTION_HOURS * 3600}, immutable"}


@router.get("/download/{job_id}")
def download_csv(job_id: str):
    """Download the full DEG results CSV produced by the R pipeline."""
    with _jobs_lock:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        csv_path     = jobs[job_id].get("csv_path")
        csv_filename = jobs[job_id].get("csv_filename")

    if not csv_path or not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail="CSV not ready yet")

    return FileResponse(
        path=csv_path, filename=csv_filename, media_type="text/csv", headers=_RESULT_CACHE_HEADERS
    )


@router.get("/heatmap/{job_id}")
def get_heatmap(job_id: str):
    """Serve the heatmap PNG generated by the R pipeline."""
    with _jobs_lock:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        heatmap_path = jobs[job_id].get("heatmap_path")

    if not heatmap_path or not os.path.exists(heatmap_path):
        raise HTTPException(status_code=404, detail="Heatmap not ready yet")

    return FileResponse(path=heatmap_path, media_type="image/png", headers=_RESULT_CACHE_HEADERS)