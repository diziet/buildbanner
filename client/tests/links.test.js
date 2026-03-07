/** Tests for link generation module. */
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { createLink } from "../src/links.js";
import { renderSegments } from "../src/segments.js";

describe("createLink", () => {
  const GITHUB_REPO = "https://github.com/acme/app";
  const GITLAB_REPO = "https://gitlab.com/acme/app";
  const BITBUCKET_REPO = "https://bitbucket.org/acme/app";

  it("GitHub commit link correct", () => {
    const url = createLink(GITHUB_REPO, "commit", "abc1234", []);
    expect(url).toBe("https://github.com/acme/app/commit/abc1234");
  });

  it("GitHub tree link correct", () => {
    const url = createLink(GITHUB_REPO, "tree", "main", []);
    expect(url).toBe("https://github.com/acme/app/tree/main");
  });

  it("GitLab commit link uses /-/commit/", () => {
    const url = createLink(GITLAB_REPO, "commit", "abc1234", []);
    expect(url).toBe("https://gitlab.com/acme/app/-/commit/abc1234");
  });

  it("GitLab tree link uses /-/tree/", () => {
    const url = createLink(GITLAB_REPO, "tree", "main", []);
    expect(url).toBe("https://gitlab.com/acme/app/-/tree/main");
  });

  it("Bitbucket commit link uses /commits/", () => {
    const url = createLink(BITBUCKET_REPO, "commit", "abc1234", []);
    expect(url).toBe("https://bitbucket.org/acme/app/commits/abc1234");
  });

  it("Bitbucket tree link uses /src/", () => {
    const url = createLink(BITBUCKET_REPO, "tree", "main", []);
    expect(url).toBe("https://bitbucket.org/acme/app/src/main");
  });

  it("self-hosted GitLab returns null with empty hostPatterns", () => {
    const url = createLink("https://gitlab.mycompany.com/team/proj", "commit", "abc1234", []);
    expect(url).toBeNull();
  });

  it("custom hostPattern for git.mycompany.com generates correct link", () => {
    const patterns = [
      { host: "git.mycompany.com", commitPath: "/-/commit/{sha}", treePath: "/-/tree/{branch}" },
    ];
    const url = createLink("https://git.mycompany.com/team/proj", "commit", "abc1234", patterns);
    expect(url).toBe("https://git.mycompany.com/team/proj/-/commit/abc1234");
  });

  it("custom hostPattern takes precedence over built-in for same host", () => {
    const patterns = [
      { host: "github.com", commitPath: "/custom-commit/{sha}", treePath: "/custom-tree/{branch}" },
    ];
    const url = createLink(GITHUB_REPO, "commit", "abc1234", patterns);
    expect(url).toBe("https://github.com/acme/app/custom-commit/abc1234");
  });

  it("Gitea host returns null without custom pattern", () => {
    const url = createLink("https://gitea.example.com/org/repo", "commit", "abc1234", []);
    expect(url).toBeNull();
  });

  it("Azure DevOps returns null without custom pattern", () => {
    const url = createLink("https://dev.azure.com/org/project", "commit", "abc1234", []);
    expect(url).toBeNull();
  });

  it("null repo_url returns null", () => {
    const url = createLink(null, "commit", "abc1234", []);
    expect(url).toBeNull();
  });

  it("sha_full is used for commit link when present (fallback to sha)", () => {
    const fullSha = "abc1234567890abcdef1234567890abcdef123456";
    const url = createLink(GITHUB_REPO, "commit", fullSha, []);
    expect(url).toBe(`https://github.com/acme/app/commit/${fullSha}`);

    const shortUrl = createLink(GITHUB_REPO, "commit", "abc1234", []);
    expect(shortUrl).toBe("https://github.com/acme/app/commit/abc1234");
  });
});

describe("link DOM attributes (via segments)", () => {
  it("link has target=_blank and rel=noopener", () => {
    const wrapper = document.createElement("div");
    const data = {
      sha: "abc1234",
      repo_url: "https://github.com/acme/app",
    };
    renderSegments(data, wrapper, { hostPatterns: [] });
    const anchor = wrapper.querySelector("[data-segment='sha']");
    expect(anchor.tagName).toBe("A");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noopener");
  });

  it("no repo_url in data renders SHA and branch as plain <span>", () => {
    const wrapper = document.createElement("div");
    const data = { sha: "abc1234", branch: "main" };
    renderSegments(data, wrapper, { hostPatterns: [] });

    const shaEl = wrapper.querySelector("[data-segment='sha']");
    const branchEl = wrapper.querySelector("[data-segment='branch']");
    expect(shaEl.tagName).toBe("SPAN");
    expect(branchEl.tagName).toBe("SPAN");
  });

  it("sha_full is used for commit link URL, sha for display text", () => {
    const wrapper = document.createElement("div");
    const data = {
      sha: "abc1234",
      sha_full: "abc1234567890abcdef1234567890abcdef123456",
      repo_url: "https://github.com/acme/app",
    };
    renderSegments(data, wrapper, { hostPatterns: [] });
    const anchor = wrapper.querySelector("[data-segment='sha']");
    expect(anchor.tagName).toBe("A");
    expect(anchor.textContent).toBe("abc1234");
    expect(anchor.href).toContain("abc1234567890abcdef1234567890abcdef123456");
  });

  it("unknown host renders SHA and branch as plain <span>", () => {
    const wrapper = document.createElement("div");
    const data = {
      sha: "abc1234",
      branch: "main",
      repo_url: "https://gitea.example.com/org/repo",
    };
    renderSegments(data, wrapper, { hostPatterns: [] });
    expect(wrapper.querySelector("[data-segment='sha']").tagName).toBe("SPAN");
    expect(wrapper.querySelector("[data-segment='branch']").tagName).toBe("SPAN");
  });
});
