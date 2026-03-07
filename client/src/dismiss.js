/** Dismiss functionality — session/permanent/none dismiss modes. */

const STORAGE_KEY = "buildbanner-dismissed";

let dismissedInMemory = false;

/** Read a value from the appropriate storage, returning null on failure. */
function _readStorage(dismiss) {
  try {
    if (dismiss === "session") {
      return sessionStorage.getItem(STORAGE_KEY);
    }
    if (dismiss === "permanent") {
      return localStorage.getItem(STORAGE_KEY);
    }
  } catch {
    return null;
  }
  return null;
}

/** Write a value to the appropriate storage, returning true on success. */
function _writeStorage(dismiss) {
  try {
    if (dismiss === "session") {
      sessionStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
    if (dismiss === "permanent") {
      localStorage.setItem(STORAGE_KEY, "1");
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Check if the banner has been dismissed. */
export function isDismissed(config) {
  if (!config || config.dismiss === "none") return false;

  const stored = _readStorage(config.dismiss);
  if (stored !== null) return true;

  return dismissedInMemory;
}

/** Create a dismiss button element, or null if dismiss mode is "none". */
export function createDismissButton(config, onDismiss) {
  if (!config || config.dismiss === "none") return null;

  const button = document.createElement("button");
  button.textContent = "\u2715";
  button.setAttribute("aria-label", "Close build banner");
  button.className = "bb-dismiss";

  button.addEventListener("click", () => {
    const wrote = _writeStorage(config.dismiss);
    if (!wrote) {
      dismissedInMemory = true;
    }
    if (typeof onDismiss === "function") {
      onDismiss();
    }
  });

  button.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      button.click();
    }
  });

  return button;
}

/** Reset the in-memory dismiss flag (for testing only). */
export function _resetDismissState() {
  dismissedInMemory = false;
}
