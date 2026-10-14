from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

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

    from routes import geo
    from routes.deg import router as deg_router

    geo.UPLOAD_DIR = str(tmp_path / "uploads")
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


def test_geo_status_returns_not_found_for_unknown_job(client):
    response = client.get("/geo/status/no-such-job")

    assert response.status_code == 404
