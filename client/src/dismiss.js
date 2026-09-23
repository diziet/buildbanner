/** The dismiss button and the stored dismissal for the session, permanent and none modes. */

const STORAGE_KEY = "buildbanner-dismissed";

// Module-level flag, shared by every caller for the life of the page. When storage is
// blocked, it is the only record of a dismissal.
let dismissedInMemory = false;

/** Return sessionStorage or localStorage for the dismiss mode, or null when there is none or access fails. */
function _getStorage(dismiss) {
  try {
    if (dismiss === "session") return sessionStorage;
    if (dismiss === "permanent") return localStorage;
  } catch {
    /* storage blocked (e.g. private browsing) */
  }
  return null;
}

/** Check if the banner has been dismissed. */
export function isDismissed(config) {
  if (!config || config.dismiss === "none") return false;

  const storage = _getStorage(config.dismiss);
  if (storage) {
    try {
      if (storage.getItem(STORAGE_KEY) !== null) return true;
    } catch {
      /* storage read blocked */
    }
  }

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
    let wrote = false;
    const storage = _getStorage(config.dismiss);
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, "1");
        wrote = true;
      } catch {
        /* storage write blocked */
      }
    }
    if (!wrote) {
      dismissedInMemory = true;
    }
    if (typeof onDismiss === "function") {
      onDismiss();
    }
  });

  return button;
}

/** Reset the in-memory dismiss flag. */
export function resetDismiss() {
  dismissedInMemory = false;
}
