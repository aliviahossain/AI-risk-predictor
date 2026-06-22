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
