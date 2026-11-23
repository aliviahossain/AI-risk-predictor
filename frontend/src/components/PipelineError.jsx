import { useState } from "react";
import "./PipelineError.css";

const FEEDBACK_URL = "https://docs.google.com/forms/d/e/1FAIpQLSe4pzWJtWDbCdj1LBhJhGCEuGB2PYFqz-PwCBchPnP-17tVTg/viewform";

// Error carrying a structured { title, message, hint, step, details } failure.
export class PipelineFailure extends Error {
  constructor(failure) {
    super(failure.message || failure.title);
    this.failure = failure;
  }
}

// Map a non-OK API response to a failure the user can act on.
export function requestFailure(res, data, action) {
  const detail = typeof data?.detail === "string" ? data.detail : "";
  if (res.status === 429) {
    const busy = /busy/i.test(detail);
    return new PipelineFailure({
      title: busy ? "The analysis server is busy" : "Hourly analysis limit reached",
      message: detail,
      hint: busy
        ? "Another analysis is running right now. Please wait a few minutes and try again."
        : "To keep the service free for everyone, each user can run a limited number of analyses per hour.",
    });
  }
  if (res.status === 413) {
    return new PipelineFailure({
      title: "File is too large",
      message: detail || "The upload exceeds the server's size limit.",
      hint: "Compress the file (.gz) or remove low-count genes before uploading.",
    });
  }
  if (res.status === 404) {
    return new PipelineFailure({
      title: "This analysis is no longer available",
      message: "The server no longer has this job — it may have expired or the server restarted.",
      hint: "Please run the analysis again.",
    });
  }
  if (res.status >= 500) {
    return new PipelineFailure({
      title: "The analysis server had a problem",
      message: detail || `${action} failed with a server error (HTTP ${res.status}).`,
      hint: "This is a problem on our side, not with your data. Please try again shortly.",
    });
  }
  return new PipelineFailure({
    title: `${action} failed`,
    message: detail || `The server rejected the request (HTTP ${res.status}).`,
  });
}

// Normalize anything thrown during a pipeline run into a failure object.
export function toFailure(err) {
  if (err?.failure) return err.failure;
  if (err instanceof TypeError) {
    return {
      title: "Cannot reach the analysis server",
      message: "The request did not get a response.",
      hint: "Check your internet connection. If it is working, the server may be restarting — try again in a minute.",
    };
  }
  return { title: "Something went wrong", message: err?.message || String(err) };
}

export default function PipelineError({ failure, onRetry }) {
  const [open, setOpen] = useState(false);
  if (!failure) return null;
  const details = failure.details || [];

  return (
    <div className="pe-box" role="alert">
      <div className="pe-head">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <div>
          <p className="pe-title">{failure.title}</p>
          {failure.step && <p className="pe-step">Failed at: {failure.step}</p>}
        </div>
      </div>

      {failure.message && <p className="pe-msg">{failure.message}</p>}
      {failure.hint && (
        <p className="pe-hint"><strong>What to try: </strong>{failure.hint}</p>
      )}

      {details.length > 0 && (
        <>
          <button type="button" className="pe-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            {open ? "Hide" : "Show"} technical details
          </button>
          {open && <pre className="pe-details">{details.join("\n")}</pre>}
        </>
      )}

      <div className="pe-actions">
        {onRetry && <button type="button" className="pe-retry" onClick={onRetry}>Try again</button>}
        <a className="pe-report" href={FEEDBACK_URL} target="_blank" rel="noreferrer">Report a problem</a>
      </div>
    </div>
  );
}
