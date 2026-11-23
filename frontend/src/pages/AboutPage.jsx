import { ROUTES } from "../components/SiteChrome";
import HeroBackdrop from "../components/HeroBackdrop";
import labLogo from "../assets/ibml-lab-logo.png";
import "./InfoPages.css";

const PRINCIPLES = [
  { title: "Established statistics", body: "Every analysis runs through limma with voom precision weights, the same framework used in thousands of peer-reviewed transcriptomics studies. No black boxes." },
  { title: "Public data, first-class", body: "Point the pipeline at any NCBI GEO series accession and it fetches, cleans, and groups the samples for you, so you can re-examine published experiments in minutes." },
  { title: "Results you can explain", body: "Volcano plots, MA plots, ranked gene charts, and a searchable table update live as you adjust fold-change and significance thresholds." },
  { title: "Your data stays yours", body: "Uploaded files are processed in an isolated job folder and removed automatically after the retention window. Nothing is shared or used for training." },
];

const PIPELINE = [
  ["Ingest",    "GEO accession, raw count matrix, microarray matrix, or a pre-computed DEG table."],
  ["Normalize", "Low-count filtering, TMM normalization, and voom mean–variance modelling."],
  ["Model",     "Linear model fit with empirical Bayes moderation and Benjamini–Hochberg FDR control."],
  ["Explore",   "Interactive plots, a sample heatmap, and CSV/PNG exports ready for your manuscript."],
];

const TEAM = [
  {
    name: "Dr. Mirza Khalid Baig",
    role: "Assistant Professor",
    dept: "Department of Biotechnology and Medical Engineering",
    org:  "National Institute of Technology Rourkela",
    linkedin: "https://www.linkedin.com/in/khalid-baig-12001024",
  },
  {
    name: "Ms. Megha Jha",
    role: "M.Tech Student",
    dept: "Department of Biotechnology and Medical Engineering",
    org:  "National Institute of Technology Rourkela",
    linkedin: "https://www.linkedin.com/in/m3ghajha",
  },
  {
    name: "Ms. Alivia Hossain",
    role: "M.Tech (Integrated) Student",
    dept: "School of Data Science and Forecasting",
    org:  "Devi Ahilya Vishwavidyalaya, Indore",
    linkedin: "https://www.linkedin.com/in/alivia-hossain-513a3a365",
  },
];

const LinkedInIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 110-4.13 2.07 2.07 0 010 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
  </svg>
);

export default function AboutPage() {
  return (
    <main className="ip-root">
      <section className="ip-hero">
        <HeroBackdrop />
        <div className="ip-hero-inner">
          <p className="ip-eyebrow">About</p>
          <h1 className="ip-title">About the project</h1>
          <p className="ip-lead">
            DEG Analysis Viewer turns gene expression data into clear, reproducible results.
            It pairs a proven R pipeline with an interactive interface, so researchers can go
            from a GEO accession or a count matrix to ranked, visualized genes without writing code.
          </p>
        </div>
      </section>

      <section className="ip-section">
        <div className="ip-container">
          <div className="ip-section-head ip-team-head">
            <div>
              <h2 className="ip-h2">Meet the team</h2>
            </div>
            <figure className="ip-lab">
              <img src={labLogo} alt="IBML lab logo" width="88" height="88" />
              <figcaption>
                <span>Developed at</span>
                <strong>IBML</strong>
              </figcaption>
            </figure>
          </div>
          <div className="ip-team">
            {TEAM.map(m => (
              <article key={m.name} className="ip-member">
                <h3 className="ip-member-name">{m.name}</h3>
                <p className="ip-member-role">{m.role}</p>
                <p className="ip-member-dept">{m.dept}</p>
                <p className="ip-member-org">{m.org}</p>
                {m.linkedin && (
                  <a href={m.linkedin} className="ip-member-link" target="_blank" rel="noopener noreferrer"
                    aria-label={`${m.name} on LinkedIn`}>
                    <LinkedInIcon /> LinkedIn
                  </a>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ip-section ip-section-alt">
        <div className="ip-container">
          <div className="ip-section-head">
                        <h2 className="ip-h2">Approach</h2>
          </div>
          <div className="ip-grid">
            {PRINCIPLES.map(p => (
              <article key={p.title} className="ip-card">
                <h3 className="ip-card-title">{p.title}</h3>
                <p className="ip-card-body">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="ip-section">
        <div className="ip-container">
          <div className="ip-section-head">
                        <h2 className="ip-h2">The analysis pipeline</h2>
          </div>
          <ol className="ip-steps">
            {PIPELINE.map(([title, body], i) => (
              <li key={title} className="ip-step">
                <span className="ip-step-num">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="ip-step-title">{title}</h3>
                  <p className="ip-step-body">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="ip-section ip-section-alt">
        <div className="ip-container ip-cta">
          <div>
            <h2 className="ip-h2">Start an analysis</h2>
            <p className="ip-cta-sub">Load a curated dataset or upload your own. No account needed.</p>
          </div>
          <div className="ip-cta-actions">
            <a href={ROUTES.home} className="sc-btn sc-btn-primary">Start an analysis</a>
            <a href={ROUTES.newsletter} className="sc-btn sc-btn-outline">Newsletter</a>
          </div>
        </div>
      </section>
    </main>
  );
}
