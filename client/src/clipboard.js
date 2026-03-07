/** Click-to-copy handler for SHA segments. */

const COPIED_DISPLAY_MS = 1500;

/** Copy text using the legacy execCommand fallback. */
function _execCommandCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

/** Show "Copied!" text then revert after timeout. */
function _flashCopied(element, originalText) {
  element.textContent = "Copied!";
  return setTimeout(() => {
    element.textContent = originalText;
  }, COPIED_DISPLAY_MS);
}

/**
 * Attach a click-to-copy handler to a SHA element.
 * On click, copies fullSha to clipboard, shows "Copied!" for 1500ms.
 */
export function attachCopyHandler(shaElement, fullSha, logger) {
  let revertTimerId = null;
  let isCopied = false;

  shaElement.addEventListener("click", (e) => {
    e.preventDefault();

    if (isCopied) return;

    const originalText = shaElement.textContent;
    isCopied = true;

    const onSuccess = () => {
      revertTimerId = _flashCopied(shaElement, originalText);
      setTimeout(() => {
        isCopied = false;
      }, COPIED_DISPLAY_MS);
    };

    const onFailure = () => {
      isCopied = false;
      logger.log("clipboard copy failed");
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(fullSha).then(onSuccess, () => {
        if (_execCommandCopy(fullSha)) {
          onSuccess();
        } else {
          onFailure();
        }
      });
    } else if (_execCommandCopy(fullSha)) {
      onSuccess();
    } else {
      onFailure();
    }
  });
}
