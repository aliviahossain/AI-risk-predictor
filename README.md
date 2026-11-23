# DEG Analysis Viewer

A full-stack web app to run and visualize Differentially Expressed Gene (DEG) analysis. Supports three input modes: upload a pre-computed DEG results CSV, fetch and run the pipeline on a GEO dataset by ID, or upload a raw expression file to run locally.

---

## What This App Does

- **Volcano Plot** — visualize up/down regulated genes
- **MA Plot** — mean expression vs fold change
- **Top Genes Chart** — ranked bar chart of significant genes
- **Gene Table** — searchable, filterable, sortable gene list
- **Summary** — quick stats of your analysis
- **Download** — export filtered CSV or heatmap PNG
- **GEO Pipeline** — enter a GSE accession ID to download and run DEG analysis via R (voom + limma)
- **Raw File Upload** — upload your own expression matrix to run the same R pipeline locally

---

## Input Modes

### Mode 1 — Upload DEG Results CSV

Upload a pre-computed CSV with these columns:

| Column | Description |
|---|---|
| `GeneSymbol` | Gene name (e.g. REC114) |
| `logFC` | Log2 fold change |
| `AveExpr` | Average expression |
| `t` | t-statistic |
| `P.Value` | Raw p-value |
| `adj.P.Val` | Adjusted p-value |
| `B` | B-statistic |

### Mode 2 — GEO Pipeline (by accession ID)

Enter a GEO accession (e.g. `GSE280402`). The backend downloads the dataset and runs the R DEG pipeline automatically.

### Mode 3 — Raw File Upload

Upload your own expression matrix (`.csv`, `.tsv`, `.txt`, `.gz`, `.tar`, `.tar.gz`, `.tgz`). The backend skips the GEO download and runs the R pipeline directly on your file.

---

## Project Structure

```
AI-risk-predictor/
├── backend/
│   ├── main.py                      ← FastAPI app entry point
│   ├── routes/
│   │   ├── deg.py                   ← /deg/upload and /deg/filter endpoints
│   │   └── geo.py                   ← /geo/run, /geo/upload-raw, /geo/status, /geo/download, /geo/heatmap
│   ├── analysis/
│   │   ├── core_deg_engine.R        ← R pipeline (voom + limma, 9-step)
│   │   └── pipeline_utils.py
│   └── venv/                        ← Python virtual environment
│
├── frontend/
│   └── src/
│       ├── App.js                   ← Root: routes between UploadPage and ResultsPage
│       ├── config.js                ← API base URL config
│       ├── pages/
│       │   ├── UploadPage.jsx       ← Three-tab upload interface
│       │   ├── UploadPage.css
│       │   ├── ResultsPage.jsx      ← Tabbed results viewer
│       │   └── ResultsPage.css
│       ├── components/
│       │   ├── VolcanoPlot.jsx
│       │   ├── MAPlot.jsx
│       │   ├── TopGenesChart.jsx
│       │   ├── GeneTable.jsx
│       │   ├── HeatmapViewer.jsx
│       │   ├── GeoFetchForm.jsx
│       │   ├── Rawuploadform.jsx
│       │   └── DownloadButton.jsx
│       └── utils/
│           ├── parseCSV.js          ← Client-side CSV parser and gene classifier
│           └── api.js               ← API call helpers
│
├── test_backend.py
└── debug_geo.R
```

---

## How to Run the App

You need **two terminals** open at the same time.

### Terminal 1 — Start the Backend

```powershell
cd "C:\Users\Alivia Hossain\Desktop\deg_test_1\AI-risk-predictor\backend"
pip install fastapi uvicorn python-multipart
uvicorn main:app --reload
```

You should see:
```
INFO: Uvicorn running on http://127.0.0.1:8000
INFO: Application startup complete.
```

> **Important:** Run `uvicorn` from inside the `backend/` folder (not the project root), so Python can resolve `from routes.deg import ...` correctly.

### Terminal 2 — Start the Frontend

```powershell
cd "C:\Users\Alivia Hossain\Desktop\deg_test_1\AI-risk-predictor\frontend"
npm install
npm start
```

Browser opens automatically at:
```
http://localhost:3000
```

---

## R Dependencies (for GEO / Raw Upload pipeline)

The R pipeline requires these Bioconductor packages. Run once in R:

```r
install.packages("BiocManager")
BiocManager::install(c("GEOquery", "limma", "edgeR", "pheatmap"))
```

Make sure `Rscript` is on your system PATH.

---

## Running Tests

Install the backend test dependencies once:

```powershell
python -m pip install -r backend/requirements-dev.txt
```

Run backend API tests, the synthetic R pipeline integration test, and frontend
tests together from the project root:

```powershell
.\test.ps1
```

The R integration test runs only when `Rscript` and the `limma`, `edgeR`, and
`pheatmap` packages are available. Set `RSCRIPT_PATH` if `Rscript` is not on
PATH. Pipeline runtime is included in pytest's duration report.

To run only one suite:

```powershell
python -m pytest -q --durations=10
npm --prefix frontend test -- --watchAll=false --runInBand
npm --prefix frontend run build
```

---

## Production Deployment (Render Free)

The complete app runs as one Render Docker web service. Caddy serves React and routes `/deg`, `/geo`, and `/health` to FastAPI. The Render Free plan uses ephemeral storage, so uploaded files and analysis results can be lost on spin-down, restart, or redeploy.

### First-time setup

1. Push this repository to GitHub and connect it to Render.
2. Create a Render Blueprint from the repository. Render reads `render.yaml` and builds the service. The first build installs R and Bioconductor packages and may take 20-40 minutes.
3. After Render assigns the service URL, add a GitHub repository variable named `RENDER_SERVICE_URL` with the full URL, such as `https://online-omics.onrender.com`.
4. In the repository's Actions tab, run **Keep Render free service warm** once, or wait for its scheduled run. It requests `/health` every 10 minutes.
5. Verify the app and `https://your-render-url/health` after deployment.

### Free plan keep-alive

GitHub Actions sends an inbound health request every 10 minutes to reduce idle spin-downs. GitHub may delay or skip scheduled runs, and Render may restart Free services at any time, so the workflow cannot guarantee the service never sleeps. It uses GitHub Actions minutes.

Render Free services spin down after 15 minutes without inbound traffic and do not support persistent disks. Job state is in memory, and active analyses stop if the process restarts. For reliable persistence and always-on service, use a paid Render plan.

### Updating

Push changes to the connected branch; Render rebuilds and deploys the service.

### Limitations

- The service allows one analysis at a time, limits raw uploads to 100 MB, archive extraction to 512 MB, DEG CSV files to 25 MB, and analysis starts to ten per client IP per hour. Completed results are cleaned up after 24 hours.
- The API is public and does not require sign-in. Never upload sensitive or identifying data.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'routes'` | Run `uvicorn main:app --reload` from inside the `backend/` folder, not the project root |
| `npm start` shows blank page | Check browser console for errors; ensure backend is running on port 8000 |
| Path error with spaces | Wrap path in quotes: `cd "C:\Users\Alivia Hossain\..."` |
| Pydantic import error | Run `pip install "fastapi==0.109.0" "pydantic==2.6.0"` |
| All genes show NS | Lower the FC threshold slider — small logFC values are normal for microarray data |
| `Rscript not found` | Install R from https://cran.r-project.org and ensure it is on PATH |
| GEO pipeline stuck / error | Check the live log panel in the app; network issues can cause GEO download failures |

---

## Tech Stack

| Part | Technology |
|---|---|
| Frontend | React 19 + plain CSS |
| Backend | FastAPI (Python) |
| R Pipeline | voom + limma (Bioconductor) |
| Plots | Pure SVG |
| Fonts | Playfair Display, Plus Jakarta Sans, JetBrains Mono |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/deg/upload` | Upload DEG CSV, returns parsed genes + summary |
| `POST` | `/deg/filter` | Re-classify genes with custom FC/p thresholds |
| `POST` | `/geo/run` | Start R pipeline for a GEO accession ID |
| `POST` | `/geo/upload-raw` | Start R pipeline from an uploaded expression file |
| `GET` | `/geo/status/{job_id}` | Poll pipeline progress and step |
| `GET` | `/geo/download/{job_id}` | Download full DEG results CSV |
| `GET` | `/geo/heatmap/{job_id}` | Serve heatmap PNG |

---

## Current Status

| Feature | Status |
|---|---|
| DEG CSV upload | Done |
| Volcano plot | Done |
| MA plot | Done |
| Top genes chart | Done |
| Gene table | Done |
| GEO pipeline (by accession) | Done |
| Raw expression file upload | Done |
| Heatmap viewer | Done |
| Shared gene finder (T2D vs Cancer) | Planned |
| Pathway enrichment | Planned |
| PPI network + hub genes | Planned |
| AI risk prediction | Planned |
