import { useState } from "react";
import { ROUTES } from "../components/SiteChrome";
import HeroBackdrop from "../components/HeroBackdrop";
import "./InfoPages.css";

const QUICKSTART = [
  { title: "DEG results file", body: "Already ran limma, edgeR or DESeq2? Upload the results table (.csv / .tsv) with columns GeneSymbol, logFC, AveExpr, t, P.Value, adj.P.Val and B. It loads instantly with no server processing." },
  { title: "Raw expression file", body: "Upload a counts matrix or microarray expression matrix (.csv, .tsv, .txt or .gz). The server runs the full limma / voom pipeline on it and loads the results when done." },
  { title: "GEO accession", body: "Type a GEO series ID such as GSE280402, or pick a curated dataset. The pipeline downloads the data from NCBI, assigns sample groups and runs the analysis, with live progress." },
];

const GLOSSARY = [
  ["DEG", "Differentially expressed gene: a gene whose expression level differs significantly between two conditions, e.g. disease vs control."],
  ["logFC", "Log2 fold change. +1 means expression doubled in the test group, −1 means it halved. Positive values are up-regulated, negative values down-regulated."],
  ["AveExpr", "Average log2 expression of the gene across all samples. Used as the x-axis of the MA plot."],
  ["t", "Moderated t-statistic from limma: the logFC divided by its standard error, after empirical Bayes moderation."],
  ["P.Value", "Raw p-value for the test that the gene's logFC is zero. Not corrected for testing thousands of genes at once."],
  ["adj.P.Val", "P-value adjusted for multiple testing with the Benjamini–Hochberg method. Read it as the false discovery rate (FDR). This is the recommended significance filter."],
  ["FDR", "False discovery rate: the expected share of false positives among the genes you call significant. An FDR cutoff of 0.05 means about 5% of called genes may be false positives."],
  ["B", "B-statistic: log-odds that the gene is truly differentially expressed. B = 0 corresponds to 50:50 odds."],
  ["Volcano plot", "logFC (x-axis) against −log10 p-value (y-axis). Genes far to the left or right and high up are both strongly changed and highly significant."],
  ["MA plot", "logFC (y-axis) against average expression (x-axis). Shows whether fold changes depend on expression level and highlights significant genes."],
  ["limma", "An R/Bioconductor package that fits linear models to expression data and uses empirical Bayes to borrow information across genes, giving stable results with few samples."],
  ["voom", "Transforms RNA-seq counts to log-CPM and estimates a precision weight for each observation, so count data can be analysed with limma."],
  ["TMM", "Trimmed mean of M-values: a normalization method (edgeR calcNormFactors) that corrects for differences in sequencing depth and library composition."],
  ["GEO / GSE", "Gene Expression Omnibus, NCBI's public repository of expression data. A GSE accession identifies one study (a series of samples)."],
  ["Heatmap", "Colour grid of expression values for top genes across samples, clustered so that similar genes and samples sit together."],
];

const FAQS = [
  ["Which thresholds should I use?", "The default is adj.P.Val < 0.05 with no fold-change cutoff. Many studies also require |logFC| ≥ 1 (a two-fold change). You can change both in the results view and the plots update instantly."],
  ["Why are no genes significant?", "Small sample sizes, weak effects or mismatched groups often give no genes below the FDR cutoff. Try relaxing the threshold, switch to raw P.Value for exploration (report it with care), or check that samples were grouped correctly in the pipeline log."],
  ["How long does the GEO pipeline take?", "Usually a few minutes. Downloading large series from NCBI is often the slowest step. The progress panel shows each stage as it runs."],
  ["What file size can I upload?", "Raw files up to 100 MB. Compressed .gz files are supported and recommended for large matrices."],
  ["Is my data stored or shared?", "Uploaded files are processed in an isolated job folder and deleted automatically after 24 hours. Nothing is shared or used for any other purpose."],
  ["Can I export my results?", "Yes. The gene table can be downloaded as a filtered CSV, and pipeline runs also provide a heatmap PNG."],
  ["Is this suitable for clinical use?", "No. DEG Analysis Viewer is a research tool and is not intended for diagnosis or clinical decision-making."],
];

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const terms = q ? GLOSSARY.filter(([t, d]) => (t + " " + d).toLowerCase().includes(q)) : GLOSSARY;

  return (
    <main className="ip-root">
      <section className="ip-hero">
        <HeroBackdrop />
        <div className="ip-hero-inner">
          <p className="ip-eyebrow">Documentation</p>
          <h1 className="ip-title">Help and glossary</h1>
          <p className="ip-lead">
            Quick summaries of each input mode, plain-language definitions of the statistics
            in your output, and answers to common questions.
          </p>
          <nav className="ip-jump" aria-label="On this page">
            <a href="#help-start" onClick={jump}>Getting started</a>
            <a href="#help-glossary" onClick={jump}>Glossary</a>
            <a href="#help-faq" onClick={jump}>FAQs</a>
          </nav>
        </div>
      </section>

      <section className="ip-section" id="help-start">
        <div className="ip-container">
          <div className="ip-section-head">
                        <h2 className="ip-h2">Getting started</h2>
          </div>
          <div className="ip-team">
            {QUICKSTART.map(s => (
              <article key={s.title} className="ip-card">
                <h3 className="ip-card-title">{s.title}</h3>
                <p className="ip-card-body">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ip-section ip-section-alt" id="help-glossary">
        <div className="ip-container">
          <div className="ip-section-head ip-gloss-head">
            <div>
                            <h2 className="ip-h2">Glossary</h2>
            </div>
            <label className="ip-search">
              <span className="ip-sr">Search glossary</span>
              <input type="search" placeholder="Search terms…" value={query} onChange={e => setQuery(e.target.value)} />
            </label>
          </div>
          {terms.length ? (
            <dl className="ip-gloss">
              {terms.map(([term, def]) => (
                <div key={term} className="ip-gloss-row">
                  <dt>{term}</dt>
                  <dd>{def}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="ip-gloss-empty">No terms match “{query}”.</p>
          )}
        </div>
      </section>

      <section className="ip-section" id="help-faq">
        <div className="ip-container">
          <div className="ip-section-head">
                        <h2 className="ip-h2">Frequently asked questions</h2>
          </div>
          <div className="ip-faq">
            {FAQS.map(([qText, a]) => (
              <details key={qText}>
                <summary>{qText}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <div className="ip-cta-actions ip-faq-cta">
            <a href={ROUTES.home} className="sc-btn sc-btn-primary">Start an analysis</a>
            <a href={ROUTES.about} className="sc-btn sc-btn-outline">About the team</a>
          </div>
        </div>
      </section>
    </main>
  );
}

// In-page jumps must not touch location.hash, which drives page routing.
function jump(e) {
  e.preventDefault();
  document.querySelector(e.currentTarget.getAttribute("href"))?.scrollIntoView({ behavior: "smooth" });
}
