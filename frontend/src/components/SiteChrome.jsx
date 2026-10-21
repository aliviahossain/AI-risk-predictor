import { useEffect, useState } from "react";
import labLogo from "../assets/ibml-lab-logo.png";
import "./SiteChrome.css";

export const ROUTES = {
  home:       "#/",
  about:      "#/about",
  help:       "#/help",
  newsletter: "#/newsletter",
};

const NAV_ITEMS = [
  { href: ROUTES.home,       label: "Analyze",    desc: "Run or load a DEG analysis" },
  { href: ROUTES.about,      label: "About",      desc: "What this platform does and why" },
  { href: ROUTES.help,       label: "Help & glossary", desc: "Summaries, key terms and FAQs" },
  { href: ROUTES.newsletter, label: "Newsletter", desc: "Coming soon, updates at your fingertips" },
];

export function Logo() {
  return (
    <a href={ROUTES.home} className="sc-logo" aria-label="DEG Analysis Viewer home">
      <svg className="sc-logo-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" fill="currentColor" />
        <path d="M10 6c0 7 12 7 12 14s-12 6-12 6M22 6c0 7-12 7-12 14s12 6 12 6"
          fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 11h8M12 21h8" stroke="#fff" strokeOpacity=".6" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="sc-logo-text">
        DEG<span className="sc-logo-light"> Analysis Viewer</span>
      </span>
    </a>
  );
}

export function SiteHeader({ route }) {
  const [open, setOpen] = useState(false);

  // Close the drawer on navigation and on Escape; lock page scroll while open.
  useEffect(() => { setOpen(false); }, [route]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sc-header">
        <div className="sc-header-inner">
          <Logo />
          <div className="sc-header-right">
            <a href={ROUTES.about} className="sc-lab" aria-label="Developed at IBML, about the team">
              <img src={labLogo} alt="" width="32" height="32" />
              <span className="sc-lab-text"><span>Developed at</span><strong>IBML</strong></span>
            </a>
            <button
              className={`sc-burger ${open ? "open" : ""}`}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="sc-drawer"
              onClick={() => setOpen(o => !o)}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      <div className={`sc-scrim ${open ? "open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />

      <nav id="sc-drawer" className={`sc-drawer ${open ? "open" : ""}`} aria-label="Main menu" aria-hidden={!open}>
        <p className="sc-drawer-label">Menu</p>
        <ul className="sc-drawer-list">
          {NAV_ITEMS.map(item => (
            <li key={item.href}>
              <a href={item.href}
                className={`sc-drawer-link ${route === item.href ? "active" : ""}`}
                tabIndex={open ? 0 : -1}>
                <span className="sc-drawer-link-title">{item.label}</span>
                <span className="sc-drawer-link-desc">{item.desc}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className="sc-drawer-foot">
          <a href={ROUTES.home} className="sc-btn sc-btn-primary sc-btn-block" tabIndex={open ? 0 : -1}>
            Start an analysis
          </a>
          <p className="sc-drawer-note">Open-source · limma / voom · NCBI GEO</p>
        </div>
      </nav>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="sc-footer">
      <div className="sc-footer-inner">
        <div>
          <Logo />
          <p className="sc-footer-tag">Differential expression analysis, from raw counts to results you can explain.</p>
        </div>
        <div className="sc-footer-links">
          <a href={ROUTES.home}>Analyze</a>
          <a href={ROUTES.about}>About</a>
          <a href={ROUTES.help}>Help</a>
          <a href={ROUTES.newsletter}>Newsletter</a>
        </div>
      </div>
      <div className="sc-footer-base">
        <span>© {new Date().getFullYear()} DEG Analysis Viewer</span>
        <span>For research use only. Not for clinical diagnosis.</span>
      </div>
    </footer>
  );
}
