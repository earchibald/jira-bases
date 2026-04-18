import { describe, it, expect } from "vitest";
import { findReferences } from "./ref-scanner";

const BASE = "https://jira.me.com";

describe("findReferences — link form", () => {
  it("captures keys from browse links matching baseUrl", () => {
    const content = "See [ABC-123 summary](https://jira.me.com/browse/ABC-123).";
    const refs = findReferences(content, BASE, []);
    expect([...refs]).toEqual(["ABC-123"]);
  });

  it("ignores links for a different host", () => {
    const content = "Old [X](https://other.example.com/browse/ABC-123)";
    expect(findReferences(content, BASE, []).size).toBe(0);
  });

  it("normalizes trailing slash on baseUrl", () => {
    const content = "[x](https://jira.me.com/browse/ABC-99)";
    const refs = findReferences(content, `${BASE}/`, []);
    expect([...refs]).toEqual(["ABC-99"]);
  });

  it("uppercases keys it captures", () => {
    const content = "[x](https://jira.me.com/browse/abc-5)";
    const refs = findReferences(content, BASE, []);
    expect([...refs]).toEqual(["ABC-5"]);
  });

  it("deduplicates repeated references", () => {
    const content = `
      [a](https://jira.me.com/browse/ABC-1)
      [b](https://jira.me.com/browse/ABC-1)
    `;
    const refs = findReferences(content, BASE, []);
    expect([...refs]).toEqual(["ABC-1"]);
  });
});

describe("findReferences — bare key form", () => {
  it("does nothing when no prefixes are configured", () => {
    const content = "Please look at ABC-10 today.";
    expect(findReferences(content, BASE, []).size).toBe(0);
  });

  it("matches bare keys for configured prefixes", () => {
    const content = "Please look at ABC-10 and PROJ-42 today.";
    const refs = findReferences(content, BASE, ["ABC", "PROJ"]);
    expect([...refs].sort()).toEqual(["ABC-10", "PROJ-42"]);
  });

  it("does not match prefixes that aren't configured", () => {
    const content = "NOPE-1 should not appear. ABC-2 should.";
    const refs = findReferences(content, BASE, ["ABC"]);
    expect([...refs]).toEqual(["ABC-2"]);
  });

  it("does not mistake UTF-8, HTTP-2, COVID-19 for keys", () => {
    const content = "Using UTF-8 over HTTP-2 (since COVID-19).";
    const refs = findReferences(content, BASE, ["UTF", "HTTP", "COVID"]);
    // These ARE technically matches if the user configured those prefixes.
    // The point is: when those prefixes are NOT configured, they must not match.
    const noPrefix = findReferences(content, BASE, []);
    expect(noPrefix.size).toBe(0);
    // And an unrelated prefix must not pick them up:
    expect(findReferences(content, BASE, ["ABC"]).size).toBe(0);
    // When configured they do match (user-stated intent):
    expect(refs.size).toBe(3);
  });

  it("requires a word boundary", () => {
    const content = "nonABC-1 does not count; ABC-1x also does not count";
    const refs = findReferences(content, BASE, ["ABC"]);
    expect(refs.size).toBe(0);
  });

  it("combines link and bare-key matches, deduplicating", () => {
    const content = `
      [a](https://jira.me.com/browse/ABC-1)
      Also ABC-1 and ABC-2 below.
    `;
    const refs = findReferences(content, BASE, ["ABC"]);
    expect([...refs].sort()).toEqual(["ABC-1", "ABC-2"]);
  });
});
