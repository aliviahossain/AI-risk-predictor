# 🧬 DEG Analysis Viewer

A web app to visualize Differentially Expressed Gene (DEG) results from limma/edgeR/DESeq2 pipelines.

---

## What This App Does

Upload your DEG results CSV and instantly get:
- 🌋 **Volcano Plot** — see up/down regulated genes visually
- 📈 **MA Plot** — mean expression vs fold change
- 🏆 **Top Genes Chart** — ranked bar chart of significant genes
- 🗂 **Gene Table** — searchable, filterable, sortable gene list
- 📋 **Summary** — quick stats of your analysis
- ⬇ **Download** — export filtered CSV or volcano SVG

---

## Expected Input File Format

Your CSV must have these columns:

| Column | Description |
|---|---|
| `GeneSymbol` | Gene name (e.g. REC114) |
| `logFC` | Log2 fold change |
| `AveExpr` | Average expression |
| `t` | t-statistic |
| `P.Value` | Raw p-value |
| `adj.P.Val` | Adjusted p-value |
| `B` | B-statistic |

---

## Folder Structure

```
AI-risk-predictor/
├── backend/
│   ├── main.py              ← FastAPI server
│   ├── routes/
│   │   ├── __init__.py
│   │   └── deg.py           ← DEG upload route
│   └── venv/                ← Python virtual environment
│
└── frontend/
    └── src/
        ├── App.js
        ├── pages/
        │   ├── UploadPage.jsx + .css
        │   └── ResultsPage.jsx + .css
        ├── components/
        │   ├── VolcanoPlot.jsx
        │   ├── MAPlot.jsx
        │   ├── TopGenesChart.jsx
        │   ├── GeneTable.jsx
        │   └── DownloadButton.jsx
        └── utils/
            └── parseCSV.js
```

---

## How to Open in VS Code

1. Open **VS Code**
2. Click **File → Open Folder**
3. Select your project folder:
   ```
   AI-risk-predictor/
   ```
4. Click **Open**

---

## How to Run the App

You need **two terminals** open at the same time in VS Code.
Open a terminal: **Terminal → New Terminal** (or `Ctrl + `` ` ``)

### Terminal 1 — Start the Backend

```powershell
cd "C:\Users\Alivia Hossain\Desktop\deg\AI-risk-predictor"
pip install fastapi uvicorn python-multipart
uvicorn backend.main:app --reload
```

✅ You should see:
```
INFO: Uvicorn running on http://127.0.0.1:8000
INFO: Application startup complete.
```

### Terminal 2 — Start the Frontend

Click the **+** button in the terminal panel to open a second terminal, then:

```powershell
cd "C:\Users\Alivia Hossain\Desktop\AI-risk-predictor\AI-risk-predictor\frontend"
npm start
```

✅ Browser will automatically open at:
```
http://localhost:3000
```

---

## How to Use the App

1. Browser opens at `http://localhost:3000`
2. Drag and drop your DEG results CSV file onto the upload zone
3. Wait a moment for parsing
4. Explore results across the 5 tabs
5. Adjust FC and P-value thresholds using the sliders
6. Download results using the buttons

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module "main"` | Make sure you are inside the `backend` folder before running uvicorn |
| `npm start` shows blank page | Replace `src/App.js` content with our App.js code |
| Path error with spaces | Wrap path in quotes: `cd "C:\Users\Alivia Hossain\..."` |
| Pydantic import error | Run `pip install "fastapi==0.109.0" "pydantic==2.6.0"` |
| All genes show NS | Lower the FC threshold slider — your data has small logFC values which is normal for blood microarray data |

---

## Tech Stack

| Part | Technology |
|---|---|
| Frontend | React + plain CSS |
| Backend | FastAPI (Python) |
| Plots | Pure SVG (no library needed) |
| Fonts | Playfair Display + Plus Jakarta Sans + JetBrains Mono |

---

## Current Status

| Feature | Status |
|---|---|
| DEG CSV upload | ✅ Done |
| Volcano plot | ✅ Done |
| MA plot | ✅ Done |
| Top genes chart | ✅ Done |
| Gene table | ✅ Done |
| Shared gene finder (T2D vs Cancer) | 🔜 Next |
| Pathway enrichment | 🔜 Planned |
| PPI network + hub genes | 🔜 Planned |
| AI risk prediction | 🔜 Planned |
| Patient risk report | 🔜 Planned |
