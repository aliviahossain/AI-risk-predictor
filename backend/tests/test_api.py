from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from routes import geo
from routes import deg
from routes.deg import classify_gene, get_summary, parse_deg_csv


CSV_CONTENT = (
    "GeneSymbol,logFC,AveExpr,t,P.Value,adj.P.Val,B\n"
    "GENE_UP,1.5,8,4,0.001,0.01,2\n"
    "GENE_DOWN,-1.5,7,-4,0.002,0.02,1\n"
    "GENE_NS,0.2,6,1,0.5,0.5,-2\n"
)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    from routes.deg import router as deg_router

    geo.UPLOAD_DIR = str(tmp_path / "uploads")
    geo.jobs.clear()
    geo._job_requests.clear()
    monkeypatch.setattr(geo, "MAX_ACTIVE_PIPELINES", 1)
    monkeypatch.setattr(geo, "MAX_UPLOAD_BYTES", 100 * 1024 * 1024)
    monkeypatch.setattr(deg, "MAX_DEG_CSV_BYTES", 25 * 1024 * 1024)
    app = FastAPI()
    app.include_router(deg_router)
    app.include_router(geo.router)

    with TestClient(app) as test_client:
        yield test_client


def test_parse_deg_csv_classifies_rows_and_summarizes():
    genes = parse_deg_csv(CSV_CONTENT)

    assert [gene["type"] for gene in genes] == ["up", "down", "ns"]
    assert get_summary(genes) == {"total": 3, "up": 1, "down": 1, "ns": 1}


def test_parse_deg_csv_rejects_missing_required_columns():
    with pytest.raises(ValueError, match="Missing required column"):
        parse_deg_csv("GeneSymbol,logFC\nGENE1,1.2\n")


def test_classification_respects_thresholds():
    assert classify_gene(1.0, 0.05) == "up"
    assert classify_gene(-1.0, 0.05) == "down"
    assert classify_gene(1.0, 0.051) == "ns"
    assert classify_gene(0.9, 0.01, fc_threshold=1.0) == "ns"


def test_deg_upload_returns_genes_and_summary(client):
    response = client.post(
        "/deg/upload",
        files={"file": ("results.csv", CSV_CONTENT, "text/csv")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == {"total": 3, "up": 1, "down": 1, "ns": 1}
    assert payload["genes"][0]["geneSymbol"] == "GENE_UP"


def test_deg_upload_rejects_invalid_csv(client):
    response = client.post(
        "/deg/upload",
        files={"file": ("results.csv", b"GeneSymbol,logFC\nGENE1,1.2\n", "text/csv")},
    )

    assert response.status_code == 422
    assert "Missing required column" in response.json()["detail"]


def test_deg_upload_rejects_unsupported_extension(client):
    response = client.post(
        "/deg/upload",
        files={"file": ("results.xlsx", b"not a csv", "application/octet-stream")},
    )

    assert response.status_code == 400


def test_deg_filter_uses_multipart_thresholds(client):
    response = client.post(
        "/deg/filter",
        files={"file": ("results.csv", CSV_CONTENT, "text/csv")},
        data={"fc_threshold": "2.0", "p_threshold": "0.05"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == {"total": 3, "up": 0, "down": 0, "ns": 3}
    assert payload["thresholds"] == {"fc_threshold": 2.0, "p_threshold": 0.05}


def test_geo_run_rejects_invalid_accession(client):
    response = client.post("/geo/run", json={"geo_id": "not-a-gse"})

    assert response.status_code == 400


def test_geo_run_rejects_path_like_accession(client):
    response = client.post("/geo/run", json={"geo_id": "GSE../../etc/passwd"})

    assert response.status_code == 400


def test_geo_status_returns_not_found_for_unknown_job(client):
    response = client.get("/geo/status/no-such-job")

    assert response.status_code == 404


def test_geo_run_rejects_when_pipeline_is_busy(client):
    with geo._jobs_lock:
        geo.jobs["busy-job"] = {"status": "running"}

    response = client.post("/geo/run", json={"geo_id": "GSE12345"})

    assert response.status_code == 429


def test_geo_run_rate_limits_analysis_starts(client, monkeypatch):
    monkeypatch.setattr(geo, "MAX_JOBS_PER_IP_PER_HOUR", 1)
    with geo._jobs_lock:
        geo._job_requests["testclient"] = [geo.time.time()]

    response = client.post("/geo/run", json={"geo_id": "GSE12345"})

    assert response.status_code == 429


def test_geo_run_reuses_finished_job_without_counting_toward_limits(client, tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "MAX_JOBS_PER_IP_PER_HOUR", 1)
    csv_path = tmp_path / "GSE12345_DEGs_Full.csv"
    csv_path.write_text(CSV_CONTENT)
    with geo._jobs_lock:
        geo._job_requests["testclient"] = [geo.time.time()]
        geo.jobs["cached-job"] = {
            "job_id": "cached-job", "geo_id": "GSE12345", "source": "geo",
            "status": "done", "csv_path": str(csv_path), "created_at": geo.time.time(),
        }

    response = client.post("/geo/run", json={"geo_id": "gse12345"})

    assert response.status_code == 200
    assert response.json()["job_id"] == "cached-job"
    assert response.json()["cached"] is True


def test_geo_run_joins_job_already_running_for_same_accession(client):
    with geo._jobs_lock:
        geo.jobs["running-job"] = {
            "job_id": "running-job", "geo_id": "GSE12345", "source": "geo",
            "status": "running", "created_at": geo.time.time(),
        }

    response = client.post("/geo/run", json={"geo_id": "GSE12345"})

    assert response.status_code == 200
    assert response.json() == {
        "job_id": "running-job", "geo_id": "GSE12345",
        "cached": False, "message": "Pipeline already running",
    }


def test_geo_run_never_reuses_raw_upload_jobs(client, tmp_path, monkeypatch):
    monkeypatch.setattr(geo, "run_r_pipeline", lambda *args, **kwargs: None)
    csv_path = tmp_path / "GSE12345_DEGs_Full.csv"
    csv_path.write_text(CSV_CONTENT)
    with geo._jobs_lock:
        geo.jobs["private-upload"] = {
            "job_id": "private-upload", "geo_id": "GSE12345", "source": "upload",
            "status": "done", "csv_path": str(csv_path), "created_at": geo.time.time(),
        }

    response = client.post("/geo/run", json={"geo_id": "GSE12345"})

    assert response.status_code == 200
    assert response.json()["job_id"] != "private-upload"
    assert response.json()["cached"] is False


def test_raw_upload_rejects_files_over_configured_limit(client, monkeypatch):
    monkeypatch.setattr(geo, "MAX_UPLOAD_BYTES", 4)

    response = client.post(
        "/geo/upload-raw",
        files={"file": ("counts.tsv", b"12345", "text/tab-separated-values")},
    )

    assert response.status_code == 413
    assert not geo.jobs


def test_deg_upload_rejects_files_over_configured_limit(client, monkeypatch):
    monkeypatch.setattr(deg, "MAX_DEG_CSV_BYTES", 4)

    response = client.post(
        "/deg/upload",
        files={"file": ("results.csv", b"12345", "text/csv")},
    )

    assert response.status_code == 413


def test_raw_upload_rejects_tar_path_traversal(client, tmp_path):
    import io
    import tarfile

    archive_bytes = io.BytesIO()
    with tarfile.open(fileobj=archive_bytes, mode="w:gz") as archive:
        member = tarfile.TarInfo("../../outside.tsv")
        member.size = 4
        archive.addfile(member, io.BytesIO(b"data"))

    response = client.post(
        "/geo/upload-raw",
        files={"file": ("counts.tar.gz", archive_bytes.getvalue(), "application/gzip")},
    )

    assert response.status_code == 400
    assert not (tmp_path / "outside.tsv").exists()
    assert not geo.jobs


def test_cleanup_removes_expired_job_files(client, tmp_path):
    job_id = "0123456789abcdef0123456789abcdef"
    job_dir = tmp_path / "uploads" / job_id
    job_dir.mkdir(parents=True)
    (job_dir / "result.csv").write_text("data", encoding="utf-8")
    finished_at = 1000.0
    with geo._jobs_lock:
        geo.jobs[job_id] = {
            "status": "done",
            "finished_at": finished_at,
            "job_dir": str(job_dir),
        }

    geo.cleanup_expired_jobs(now=finished_at + geo.JOB_RETENTION_HOURS * 3600 + 1)

    assert job_id not in geo.jobs
    assert not job_dir.exists()


def test_newsletter_subscribe_validates_and_dedupes(tmp_path, monkeypatch):
    from routes import newsletter

    monkeypatch.setattr(newsletter, "DATA_DIR", str(tmp_path / "data"))
    app = FastAPI()
    app.include_router(newsletter.router)
    client = TestClient(app)

    bad = client.post("/newsletter/subscribe", json={"email": "not-an-email"})
    assert bad.status_code == 422

    first = client.post("/newsletter/subscribe", json={"email": "Ada@Example.com", "name": "Ada"})
    assert first.json() == {"status": "subscribed"}

    again = client.post("/newsletter/subscribe", json={"email": "ada@example.com"})
    assert again.json() == {"status": "already_subscribed"}

    rows = (tmp_path / "data" / "subscribers.csv").read_text(encoding="utf-8").splitlines()
    assert len(rows) == 2


def test_classify_failure_explains_too_few_samples():
    failure = geo._classify_failure(
        ["ERROR: Only 3 valid samples. Need >= 4."], "Cleaning matrix", upload_mode=True
    )

    assert failure["title"] == "Not enough samples"
    assert failure["step"] == "Cleaning matrix"
    assert failure["details"] == ["ERROR: Only 3 valid samples. Need >= 4."]


def test_classify_failure_tailors_missing_matrix_hint_to_mode():
    lines = ["ERROR: Could not load expression data"]
    geo_failure = geo._classify_failure(lines, "Reading count matrix", upload_mode=False)
    raw_failure = geo._classify_failure(lines, "Reading count matrix", upload_mode=True)

    assert geo_failure["title"] == "No usable expression matrix found"
    assert "Raw expression file" in geo_failure["hint"]
    assert raw_failure["message"].startswith("The uploaded file")


def test_classify_failure_falls_back_to_generic_message_with_uncaught_r_error():
    failure = geo._classify_failure(
        ["  [OK] limma", "Error in foo(x) : subscript out of bounds", "Execution halted"],
        "Assigning groups", upload_mode=False,
    )

    assert failure["title"] == "The analysis stopped unexpectedly"
    assert "Assigning groups" in failure["message"]
    assert failure["details"] == ["Error in foo(x) : subscript out of bounds"]


def test_geo_status_reports_classified_failure(client):
    geo.jobs["job1"] = {
        "geo_id": "GSE1", "status": "running", "step": "Running DGE (voom + limma)",
        "log": ["ERROR lmFit: no residual degrees of freedom"], "errors": [],
        "summary": None, "created_at": 0,
    }
    geo._fail_job("job1", upload_mode=False)

    body = client.get("/geo/status/job1").json()
    assert body["status"] == "error"
    assert body["failure"]["title"] == "The statistical model could not be fitted"
    assert body["failure"]["step"] == "Running DGE (voom + limma)"
