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
