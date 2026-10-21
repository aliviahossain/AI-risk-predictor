import { ROUTES } from "../components/SiteChrome";
import HeroBackdrop from "../components/HeroBackdrop";
import "./InfoPages.css";

const TOPICS = ["Product updates", "Method notes", "New datasets"];

const PERKS = [
  ["Release notes", "New pipeline features and visualizations as they ship."],
  ["Method notes",  "Short, practical write-ups on DEG analysis choices and pitfalls."],
  ["Dataset picks", "Curated GEO series worth re-analysing, with context."],
];

// Subscriptions are not open yet: the form below is a visual placeholder only
// and never submits. The backend endpoint lives in routes/newsletter.py.
export default function NewsletterPage() {
  return (
    <main className="ip-root">
      <section className="ip-hero">
        <HeroBackdrop />
        <div className="ip-hero-inner ip-news">
          <div className="ip-news-copy">
            <p className="ip-eyebrow">Newsletter</p>
            <h1 className="ip-title">Updates at your fingertips, soon</h1>
            <p className="ip-lead">
              We're putting together a concise newsletter on DEG analysis: product releases,
              methodology notes, and datasets worth your time. Subscriptions will open shortly.
            </p>
            <ul className="ip-perks">
              {PERKS.map(([title, body]) => (
                <li key={title}>
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <div><strong>{title}</strong><span>{body}</span></div>
                </li>
              ))}
            </ul>
          </div>

          <div className="ip-form-card ip-soon">
            <span className="ip-soon-badge">Coming soon</span>
            <h2 className="ip-form-title">Subscribe</h2>
            <p className="ip-form-sub">
              We will bring the latest updates to your fingertips soon. Check back here when subscriptions open.
            </p>

            <form onSubmit={e => e.preventDefault()}>
              <fieldset disabled className="ip-soon-fields">
                <label className="ip-field">
                  <span>Work email</span>
                  <input type="email" placeholder="you@institute.org" />
                </label>

                <label className="ip-field">
                  <span>Name <em>(optional)</em></span>
                  <input type="text" placeholder="Dr. Jane Doe" />
                </label>

                <div className="ip-topics">
                  <p className="ip-topics-label">Topics</p>
                  {TOPICS.map(t => <span key={t} className="ip-chip">{t}</span>)}
                </div>

                <button type="submit" className="sc-btn sc-btn-primary sc-btn-block">
                  Subscriptions opening soon
                </button>
              </fieldset>
            </form>

            <a href={ROUTES.home} className="ip-soon-back">Meanwhile, start an analysis →</a>
          </div>
        </div>
      </section>
    </main>
  );
}
