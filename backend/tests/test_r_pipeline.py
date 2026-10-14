import json
import os
from pathlib import Path
import shutil
import subprocess
import time

import pytest


ROOT = Path(__file__).resolve().parents[2]
R_SCRIPT = ROOT / "backend" / "analysis" / "core_deg_engine.R"
R_UTILS_TEST = ROOT / "backend" / "tests" / "test_pipeline_utils.R"


def _find_rscript():
    configured_path = os.environ.get("RSCRIPT_PATH")
    if configured_path and Path(configured_path).is_file():
        return configured_path

    return shutil.which("Rscript")


def test_geo_download_selection_prefers_one_expression_file():
    rscript = _find_rscript()
    if not rscript:
        pytest.skip("Rscript is not installed or is not on PATH (set RSCRIPT_PATH to enable).")

    result = subprocess.run(
        [rscript, str(R_UTILS_TEST)],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
        cwd=ROOT,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "GEO supplementary-file selection tests passed" in result.stdout


@pytest.mark.integration
def test_raw_count_pipeline_completes_and_reports_runtime(tmp_path, record_property):
    rscript = _find_rscript()
    if not rscript:
        pytest.skip("Rscript is not installed or is not on PATH (set RSCRIPT_PATH to enable).")

    package_check = subprocess.run(
        [
            rscript,
            "-e",
            "quit(status=if (all(vapply(c('limma','edgeR','pheatmap'), "
            "requireNamespace, logical(1), quietly=TRUE))) 0 else 1)",
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if package_check.returncode != 0:
        pytest.skip("R pipeline packages limma, edgeR, and pheatmap must be installed.")

    matrix_file = tmp_path / "synthetic_counts.tsv"
    output_dir = tmp_path / "results"
    output_dir.mkdir()

    header = ["GeneSymbol"] + [
        "Control1", "Control2", "Control3", "Case1", "Case2", "Case3"
    ]
    rows = ["\t".join(header)]
    for index in range(1, 121):
        baseline = 20 + index % 30
        counts = [
            baseline,
            baseline + 2,
            baseline + 4,
            baseline + 8,
            baseline + 10,
            baseline + 12,
        ]
        rows.append("\t".join([f"GENE{index}", *(str(value) for value in counts)]))
    matrix_file.write_text("\n".join(rows) + "\n", encoding="utf-8")

    started = time.perf_counter()
    result = subprocess.run(
        [
            rscript,
            str(R_SCRIPT),
            "TEST",
            str(output_dir),
            str(matrix_file),
        ],
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
        cwd=ROOT,
    )
    elapsed = time.perf_counter() - started
    record_property("r_pipeline_runtime_seconds", round(elapsed, 3))

    assert result.returncode == 0, result.stdout + result.stderr
    assert "=== PIPELINE COMPLETE ===" in result.stdout
    assert "STEP 6: DGE analysis" in result.stdout

    summary = json.loads((output_dir / "pipeline_summary.json").read_text(encoding="utf-8"))
    assert summary["geo_id"] == "TEST"
    assert summary["samples"] == 6
    assert summary["case_samples"] == 3
    assert summary["control_samples"] == 3
    assert summary["total_genes"] > 0
    assert (output_dir / "TEST_DEGs_Full.csv").is_file()
    assert (output_dir / "TEST_Top28_Heatmap.png").is_file()
