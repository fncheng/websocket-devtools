import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, ListTree, TriangleAlert } from "lucide-react";
import { t } from "../utils/i18n.js";
import { copyTextToClipboard } from "../utils/clipboard.js";
import { getJsonContextCopyValue, getJsonContextPath } from "../utils/jsonContextTarget.js";

const MENU_MARGIN = 8;

/**
 * @param {{ state: import("../types/jsonContextMenu.js").JsonContextMenuState | null, getView: () => import("@codemirror/view").EditorView | null, onClose: () => void }} props
 */
const JsonContextMenu = ({ state, getView, onClose }) => {
  const menuRef = useRef(null);
  const [layout, setLayout] = useState({ id: null, position: null });
  const [copyStatus, setCopyStatus] = useState("idle");
  const stateRef = useRef(state);
  const focusedMenuId = useRef(null);

  useEffect(() => {
    stateRef.current = state;
    setCopyStatus("idle");
  }, [state]);

  useLayoutEffect(() => {
    if (!state || !menuRef.current) return undefined;
    const menuRect = menuRef.current.getBoundingClientRect();
    setLayout({
      id: state.id,
      position: {
        x: Math.max(MENU_MARGIN, Math.min(state.x, window.innerWidth - menuRect.width - MENU_MARGIN)),
        y: Math.max(MENU_MARGIN, Math.min(state.y, window.innerHeight - menuRect.height - MENU_MARGIN)),
      },
    });
    if (focusedMenuId.current !== state.id) {
      const firstItem = menuRef.current.querySelector("button:not([disabled])");
      firstItem?.focus({ preventScroll: true });
      focusedMenuId.current = state.id;
    }
    return undefined;
  }, [state?.id, copyStatus]);

  useEffect(() => {
    if (!state) return undefined;
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [state, onClose]);

  if (!state) return null;
  const position = layout.id === state.id && layout.position
    ? layout.position
    : { x: state.x, y: state.y };

  const getCurrentDocumentText = () => {
    const view = getView();
    if (!view || view.state.doc !== state.document) return null;
    return view.state.doc.toString();
  };

  const copy = async (kind) => {
    const documentText = getCurrentDocumentText();
    if (documentText === null) {
      onClose();
      return;
    }
    const text = kind === "selection"
      ? documentText.slice(state.selection.from, state.selection.to)
      : kind === "path"
        ? getJsonContextPath(state.target)
        : getJsonContextCopyValue(documentText, state.target);
    if (text === null) return;
    const copied = await copyTextToClipboard(text);
    if (stateRef.current?.id !== state.id) return;
    setCopyStatus(copied ? "success" : "error");
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll("button:not([disabled])") || []);
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = Math.max(0, items.indexOf(document.activeElement));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[nextIndex].focus();
  };

  const propertyPath = getJsonContextPath(state.target);
  const hasSelection = state.selection.from !== state.selection.to;
  const statusText = copyStatus === "success"
    ? t("jsonViewer.contextMenu.copied")
    : copyStatus === "error"
      ? t("jsonViewer.contextMenu.copyFailed")
      : "";

  return createPortal(
    <div
      ref={menuRef}
      className="json-context-menu"
      role="menu"
      aria-label={t("jsonViewer.contextMenu.label")}
      onKeyDown={handleKeyDown}
      style={{ left: position.x, top: position.y }}
    >
      <button type="button" role="menuitem" onClick={() => copy("value")}>
        <Copy size={14} />
        <span>{t("jsonViewer.contextMenu.copyValue")}</span>
      </button>
      <button type="button" role="menuitem" onClick={() => copy("path")} disabled={!propertyPath} title={t("jsonViewer.contextMenu.pathHint")}>
        <ListTree size={14} />
        <span>{t("jsonViewer.contextMenu.copyPath")}</span>
      </button>
      {hasSelection && (
        <button type="button" role="menuitem" onClick={() => copy("selection")}>
          <Copy size={14} />
          <span>{t("jsonViewer.contextMenu.copySelection")}</span>
        </button>
      )}
      {statusText && (
        <div className={`json-context-menu-status json-context-menu-status-${copyStatus}`} role="status" aria-live="polite">
          {copyStatus === "success" ? <Check size={14} /> : <TriangleAlert size={14} />}
          <span>{statusText}</span>
        </div>
      )}
    </div>,
    document.body
  );
};

export default JsonContextMenu;
