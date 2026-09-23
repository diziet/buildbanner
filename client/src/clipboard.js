/** Click-to-copy handler for SHA segments. */

const COPIED_DISPLAY_MS = 1500;

/**
 * Copy text with the legacy document.execCommand("copy").
 * Inline styles move the temporary textarea off-screen, so under a strict CSP
 * that blocks inline styles the textarea may show for a moment.
 */
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

/** Show "Copied!" in the element, then restore its text after COPIED_DISPLAY_MS. */
function _flashCopied(element, originalText) {
  element.textContent = "Copied!";
  return setTimeout(() => {
    element.textContent = originalText;
  }, COPIED_DISPLAY_MS);
}

/**
 * Attach a click-to-copy handler to a SHA element.
 * A click copies fullSha to the clipboard and shows "Copied!" for 1500 ms.
 * A click with Cmd or Ctrl held is left to the browser.
 */
export function attachCopyHandler(shaElement, fullSha, logger) {
  let isCopied = false;

  shaElement.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();

    if (isCopied) return;

    const originalText = shaElement.textContent;
    isCopied = true;

    const onSuccess = () => {
      _flashCopied(shaElement, originalText);
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
