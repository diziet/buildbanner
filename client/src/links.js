/** Link generation for SHA and branch segments. */

const BUILTIN_HOSTS = {
  "github.com": { commitPath: "/commit/{sha}", treePath: "/tree/{branch}" },
  "gitlab.com": { commitPath: "/-/commit/{sha}", treePath: "/-/tree/{branch}" },
  "bitbucket.org": { commitPath: "/commits/{sha}", treePath: "/src/{branch}" },
};

/** Find a matching host pattern from custom patterns or built-in rules. */
function _findPattern(hostname, hostPatterns) {
  for (const pattern of hostPatterns) {
    if (pattern.host === hostname) return pattern;
  }
  return BUILTIN_HOSTS[hostname] || null;
}

const TEMPLATE_MAP = { commit: "commitPath", tree: "treePath" };

/** Build a full URL from repo_url, path template, and value. */
function _buildUrl(repoUrl, template, value) {
  const encoded = encodeURIComponent(value);
  const path = template.replace("{sha}", encoded).replace("{branch}", encoded);
  return repoUrl.replace(/\/+$/, "") + path;
}

/**
 * Create a link URL for a commit or tree.
 * Returns the full URL string, or null if no pattern matches.
 */
export function createLink(repoUrl, type, value, hostPatterns = []) {
  if (!repoUrl || !value) return null;
  if (!Array.isArray(hostPatterns)) return null;

  const templateKey = TEMPLATE_MAP[type];
  if (!templateKey) return null;

  let hostname;
  try {
    hostname = new URL(repoUrl).hostname;
  } catch {
    return null;
  }

  const pattern = _findPattern(hostname, hostPatterns);
  if (!pattern) return null;

  const template = pattern[templateKey];
  if (!template) return null;

  return _buildUrl(repoUrl, template, value);
}
