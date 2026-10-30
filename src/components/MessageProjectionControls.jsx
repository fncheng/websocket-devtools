import React, { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../utils/i18n.js";
import { collectFieldCandidates, parseProjectionPath } from "../utils/messageProjection.js";

/**
 * @typedef {{ mode: "raw" | "field", path: string, hideMissing: boolean, hideEmpty: boolean }} ProjectionConfig
 */

const EMPTY_CANDIDATES = [];

const MessageProjectionControls = ({ config, messages, cache, onChange }) => {
  const [draftPath, setDraftPath] = useState(config.path);
  const [pathError, setPathError] = useState("");
  const [areCandidatesFrozen, setCandidatesFrozen] = useState(false);
  const candidateSnapshotRef = useRef(null);

  useEffect(() => {
    setDraftPath(config.path);
    setPathError("");
  }, [config.path]);

  const candidates = useMemo(() => {
    if (config.mode !== "field") return EMPTY_CANDIDATES;
    return collectFieldCandidates(messages, undefined, cache);
  }, [cache, config.mode, messages]);
  // Native select menus repaint when their option nodes change while open.
  const displayedCandidates = areCandidatesFrozen
    ? candidateSnapshotRef.current || candidates
    : candidates;

  const freezeCandidates = () => {
    candidateSnapshotRef.current = candidates;
    setCandidatesFrozen(true);
  };

  const resumeCandidateUpdates = () => {
    candidateSnapshotRef.current = null;
    setCandidatesFrozen(false);
  };

  const applyPath = () => {
    const parsed = parseProjectionPath(draftPath);
    if (!parsed.ok) {
      setPathError(t("messageDetails.projection.invalidPath"));
      return;
    }
    setPathError("");
    onChange({ path: draftPath.trim() });
  };

  const clearPath = () => {
    setDraftPath("");
    setPathError("");
    onChange({ mode: "raw", path: "" });
  };

  return (
    <div className="projection-controls">
      <div className="projection-mode" role="group" aria-label={t("messageDetails.projection.mode")}> 
        <button type="button" aria-pressed={config.mode === "raw"} className={config.mode === "raw" ? "active" : ""} onClick={() => onChange({ mode: "raw" })}>
          {t("messageDetails.projection.raw")}
        </button>
        <button type="button" aria-pressed={config.mode === "field"} className={config.mode === "field" ? "active" : ""} onClick={() => onChange({ mode: "field" })}>
          {t("messageDetails.projection.field")}
        </button>
      </div>
      {config.mode === "field" && (
        <>
          <div className="projection-path-control">
            <label htmlFor="message-projection-path">{t("messageDetails.projection.path")}</label>
            <input
              id="message-projection-path"
              type="text"
              value={draftPath}
              onChange={(event) => setDraftPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyPath();
              }}
              aria-invalid={Boolean(pathError)}
              aria-describedby={pathError ? "message-projection-path-error" : undefined}
              spellCheck="false"
              placeholder="choices[0].message.content"
            />
            <button type="button" onClick={applyPath}>{t("messageDetails.projection.apply")}</button>
            {config.path && <button type="button" onClick={clearPath}>{t("messageDetails.projection.clear")}</button>}
          </div>
          {pathError && <span id="message-projection-path-error" className="projection-error" role="alert">{pathError}</span>}
          {displayedCandidates.length > 0 && (
            <select
              className="projection-candidates"
              value=""
              aria-label={t("messageDetails.projection.candidates")}
              onMouseDown={freezeCandidates}
              onKeyDown={(event) => {
                if ([" ", "ArrowDown", "ArrowUp", "Enter"].includes(event.key)) freezeCandidates();
              }}
              onBlur={resumeCandidateUpdates}
              onChange={(event) => {
                if (!event.target.value) return;
                setDraftPath(event.target.value);
                setPathError("");
                onChange({ path: event.target.value });
                resumeCandidateUpdates();
              }}
            >
              <option value="">{t("messageDetails.projection.candidates")}</option>
              {displayedCandidates.map((candidate) => <option key={candidate.path} value={candidate.path}>{candidate.path} — {candidate.preview}</option>)}
            </select>
          )}
          <label className="invert-checkbox projection-checkbox">
            <input type="checkbox" checked={config.hideMissing} onChange={(event) => onChange({ hideMissing: event.target.checked })} />
            <span className="checkmark"></span><span className="checkbox-label">{t("messageDetails.projection.hideMissing")}</span>
          </label>
          <label className="invert-checkbox projection-checkbox">
            <input type="checkbox" checked={config.hideEmpty} onChange={(event) => onChange({ hideEmpty: event.target.checked })} />
            <span className="checkmark"></span><span className="checkbox-label">{t("messageDetails.projection.hideEmpty")}</span>
          </label>
        </>
      )}
    </div>
  );
};

export default MessageProjectionControls;
