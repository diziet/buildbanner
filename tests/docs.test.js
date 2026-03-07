/** Tests for documentation completeness. */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

/** Read a file relative to the project root. */
function readDoc(relativePath) {
  const fullPath = join(ROOT, relativePath);
  return readFileSync(fullPath, 'utf-8');
}

describe('documentation files exist', () => {
  const requiredDocs = [
    'docs/README.md',
    'docs/configuration.md',
    'docs/security.md',
    'docs/csp.md',
    'docs/self-hosting.md',
  ];

  for (const doc of requiredDocs) {
    it(`${doc} exists`, () => {
      expect(existsSync(join(ROOT, doc))).toBe(true);
    });
  }
});

describe('README contains required sections', () => {
  let readme;

  beforeAll(() => {
    readme = readDoc('docs/README.md');
  });

  it('is non-empty', () => {
    expect(readme.length).toBeGreaterThan(0);
  });

  it('contains quick start section', () => {
    expect(readme.toLowerCase()).toContain('quick start');
  });

  it('contains configuration section', () => {
    expect(readme.toLowerCase()).toContain('## configuration');
  });

  it('contains API section', () => {
    expect(readme.toLowerCase()).toContain('programmatic api');
  });

  it('contains server helpers section', () => {
    expect(readme.toLowerCase()).toContain('server helpers');
  });

  it('contains environment variables section', () => {
    expect(readme.toLowerCase()).toContain('environment variables');
  });
});

describe('security.md mentions token limitations', () => {
  it('mentions token is not a security boundary', () => {
    const security = readDoc('docs/security.md');
    expect(security.toLowerCase()).toContain('not a security boundary');
  });
});

describe('README references schema.json', () => {
  it('contains link to shared/schema.json', () => {
    const readme = readDoc('docs/README.md');
    expect(readme).toContain('schema.json');
  });
});

describe('all framework names are mentioned in README', () => {
  const frameworks = [
    'Flask',
    'Django',
    'FastAPI',
    'Express',
    'Koa',
    'Hono',
    'Rack',
    'Rails',
    'nginx',
  ];

  let readme;

  beforeAll(() => {
    readme = readDoc('docs/README.md');
  });

  for (const framework of frameworks) {
    it(`mentions ${framework}`, () => {
      expect(readme).toContain(framework);
    });
  }
});

describe('examples directories exist', () => {
  it('examples/static-html/ directory exists', () => {
    expect(existsSync(join(ROOT, 'examples/static-html'))).toBe(true);
  });

  it('examples/flask-app/ directory exists', () => {
    expect(existsSync(join(ROOT, 'examples/flask-app'))).toBe(true);
  });

  it('examples/express-app/ directory exists', () => {
    expect(existsSync(join(ROOT, 'examples/express-app'))).toBe(true);
  });

  it('examples/rails-app/ directory exists', () => {
    expect(existsSync(join(ROOT, 'examples/rails-app'))).toBe(true);
  });
});
