/**
 * Copy text and report the browser's actual success result.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
export const copyTextToClipboard = async (text) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path for extension pages without clipboard permission.
    }
  }

  if (typeof document === "undefined" || !document.body) return false;
  const activeElement = document.activeElement;
  const selection = window.getSelection?.();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
    : [];
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus({ preventScroll: true });
  textArea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy") === true;
  } catch {
    copied = false;
  }

  textArea.remove();
  if (selection) {
    selection.removeAllRanges();
    ranges.forEach((range) => selection.addRange(range));
  }
  if (typeof HTMLElement !== "undefined" && activeElement instanceof HTMLElement) {
    activeElement.focus({ preventScroll: true });
  }
  return copied;
};
