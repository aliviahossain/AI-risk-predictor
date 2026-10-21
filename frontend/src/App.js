import { useEffect, useState } from "react";
import UploadPage     from "./pages/UploadPage";
import ResultsPage    from "./pages/ResultsPage";
import AboutPage      from "./pages/AboutPage";
import NewsletterPage from "./pages/NewsletterPage";
import HelpPage       from "./pages/HelpPage";
import { ROUTES, SiteHeader, SiteFooter } from "./components/SiteChrome";
import { clearSession, loadSession, saveSession } from "./utils/sessionCache";

const currentRoute = () =>
  Object.values(ROUTES).includes(window.location.hash) ? window.location.hash : ROUTES.home;

export default function App() {
  const [genes,    setGenes]    = useState(null);
  const [filename, setFilename] = useState("");
  const [jobId,    setJobId]    = useState(null);
  const [route,    setRoute]    = useState(currentRoute);
  const [restoring, setRestoring] = useState(true);

  // Restore the last analysis so a page reload doesn't lose loaded results.
  useEffect(() => {
    let active = true;
    loadSession().then(session => {
      if (!active) return;
      if (session) {
        setGenes(g => g ?? session.genes);
        setFilename(f => f || session.filename);
        setJobId(j => j ?? session.jobId);
      }
      setRestoring(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onHash = () => { setRoute(currentRoute()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const handleDataLoaded = (parsedGenes, name, jid = null) => {
    setGenes(parsedGenes);
    setFilename(name);
    setJobId(jid);
    saveSession({ genes: parsedGenes, filename: name, jobId: jid });
  };

  const handleReset = () => {
    setGenes(null);
    setFilename("");
    setJobId(null);
    clearSession();
  };

  return (
    <>
      <SiteHeader route={route} />
      {route === ROUTES.about      && <AboutPage />}
      {route === ROUTES.help       && <HelpPage />}
      {route === ROUTES.newsletter && <NewsletterPage />}
      {route === ROUTES.home && (
        restoring && !genes ? <main className="app-restoring" aria-busy="true" />
        : genes ? <ResultsPage genes={genes} filename={filename} jobId={jobId} onReset={handleReset} />
        : <UploadPage onDataLoaded={handleDataLoaded} />)}
      <SiteFooter />
    </>
  );
}
