/** Generate dist/buildbanner.css — fallback stylesheet for non-Shadow-DOM environments. */
const { writeFileSync, mkdirSync } = require("node:fs");
const { resolve } = require("node:path");

const DARK_BG = "#1a1a2e";
const DARK_FG = "#e0e0e0";
const DARK_LINK = "#6fa8dc";
const FONT_FAMILY =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
const FONT_SIZE = "12px";
const DEFAULT_HEIGHT = 28;
const DEFAULT_Z_INDEX = 999999;

const css = `/* BuildBanner fallback stylesheet for non-Shadow-DOM environments. */
.__buildbanner-host {
  all: initial;
  display: block;
}

.__buildbanner-wrapper {
  all: initial;
  display: flex;
  align-items: center;
  gap: 0;
  position: sticky;
  top: 0;
  z-index: ${DEFAULT_Z_INDEX};
  height: ${DEFAULT_HEIGHT}px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ${FONT_FAMILY};
  font-size: ${FONT_SIZE};
  line-height: ${DEFAULT_HEIGHT}px;
  color: ${DARK_FG};
  background: ${DARK_BG};
  padding: 0 8px;
  box-sizing: border-box;
  font-weight: normal;
  font-style: normal;
  text-transform: none;
  letter-spacing: normal;
  word-spacing: normal;
  text-align: left;
  text-decoration: none;
  visibility: visible;
  opacity: 1;
  direction: ltr;
}

.__buildbanner-clickable {
  cursor: pointer;
}

.__buildbanner-wrapper a {
  color: ${DARK_LINK};
  text-decoration: none;
}

.__buildbanner-wrapper a:hover {
  text-decoration: underline;
}
`;

const distDir = resolve(__dirname, "..", "dist");
mkdirSync(distDir, { recursive: true });
writeFileSync(resolve(distDir, "buildbanner.css"), css);
console.log("OK: dist/buildbanner.css generated");
