import { findReferences } from "./ref-scanner";
import { readFrontmatter } from "./frontmatter";

export interface IndexerDeps {
  read(path: string): Promise<string | null>;
  listNotes(): Promise<string[]>;
  getSettings(): {
    baseUrl: string;
    prefixes: string[];
    stubsFolder: string;
  };
}

export async function collectAllKeys(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<Set<string>> {
  const { baseUrl, prefixes } = deps.getSettings();
  const keys = new Set<string>();
  // Fast path: nothing can ever match when both sources of key patterns are absent.
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const validPrefixes = prefixes.filter((p) => /^[A-Z][A-Z0-9]+$/.test(p));
  if (normalizedBase.length === 0 && validPrefixes.length === 0) return keys;
  const notes = await deps.listNotes();
  const prefix = stubsFolder.replace(/^\/+|\/+$/, "") + "/";
  for (const path of notes) {
    if (path.startsWith(prefix)) continue;
    const content = await deps.read(path);
    if (content === null) continue;
    const { body } = readFrontmatter(content);
    for (const k of findReferences(body, baseUrl, prefixes)) keys.add(k);
  }
  return keys;
}

export async function listStubPaths(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const prefix = stubsFolder.replace(/^\/+|\/+$/, "") + "/";
  const notes = await deps.listNotes();
  for (const path of notes) {
    if (!path.startsWith(prefix)) continue;
    const content = await deps.read(path);
    if (content === null) continue;
    const { frontmatter } = readFrontmatter(content);
    const key = frontmatter.jira_key;
    if (typeof key === "string") map.set(key, path);
  }
  return map;
}

export interface OrphanStub {
  key: string;
  path: string;
}

export async function findOrphanedStubs(
  deps: IndexerDeps,
  stubsFolder: string,
): Promise<OrphanStub[]> {
  const referenced = await collectAllKeys(deps, stubsFolder);
  const stubs = await listStubPaths(deps, stubsFolder);
  const orphans: OrphanStub[] = [];
  for (const [key, path] of stubs) {
    if (!referenced.has(key)) orphans.push({ key, path });
  }
  return orphans;
}
