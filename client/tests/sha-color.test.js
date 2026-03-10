/** Tests for SHA color derivation module. */
import { describe, it, expect } from "vitest";
import { getShaColor } from "../src/sha-color.js";

describe("getShaColor", () => {
  it("returns null for null sha", () => {
    expect(getShaColor(null)).toBe(null);
  });

  it("returns null for undefined sha", () => {
    expect(getShaColor(undefined)).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(getShaColor("")).toBe(null);
  });

  it("returns null for sha shorter than 6 characters", () => {
    expect(getShaColor("a1b2c")).toBe(null);
  });

  it("returns null for non-hex characters in first 6", () => {
    expect(getShaColor("zzzzzz1234")).toBe(null);
  });

  it("returns a hex color string for valid sha", () => {
    const color = getShaColor("a1b2c3def0123456789");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("uses first 6 chars of sha as base color", () => {
    const color = getShaColor("ffffff");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns same color for same sha prefix", () => {
    const a = getShaColor("a1b2c3000000");
    const b = getShaColor("a1b2c3ffffff");
    expect(a).toBe(b);
  });

  it("returns different colors for different sha prefixes", () => {
    const a = getShaColor("a1b2c3def");
    const b = getShaColor("112233def");
    expect(a).not.toBe(b);
  });

  it("dark theme adjusts dark colors to be lighter", () => {
    // 000000 is pure black — should be lightened for dark theme
    const color = getShaColor("000000abcdef", "dark");
    expect(color).not.toBe("#000000");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("light theme adjusts light colors to be darker", () => {
    // ffffff is pure white — should be darkened for light theme
    const color = getShaColor("ffffffabcdef", "light");
    expect(color).not.toBe("#ffffff");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("dark theme passes through already-light colors", () => {
    // cccccc has high luminance — should pass through for dark theme
    const color = getShaColor("cccccc", "dark");
    expect(color).toBe("#cccccc");
  });

  it("light theme passes through already-dark colors", () => {
    // 222222 has low luminance — should pass through for light theme
    const color = getShaColor("222222", "light");
    expect(color).toBe("#222222");
  });

  it("handles exactly 6 character sha", () => {
    const color = getShaColor("abcdef");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("handles uppercase hex characters", () => {
    const color = getShaColor("ABCDEF");
    expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("defaults to dark theme when theme not specified", () => {
    const a = getShaColor("a1b2c3");
    const b = getShaColor("a1b2c3", "dark");
    expect(a).toBe(b);
  });

  it("returns non-null for non-string type", () => {
    expect(getShaColor(123456)).toBe(null);
  });
});
