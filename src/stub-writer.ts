import { readFrontmatter, writeFrontmatter, Frontmatter } from "./frontmatter";
import type { IssueDetails } from "./jira-fields";

export interface VaultAdapter {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  ensureFolder(path: string): Promise<void>;
}

export function stubFileName(details: IssueDetails): string {
  const raw = `${details.key} ${details.summary}`;
  const sanitized = raw
    .replace(/[\\/:*?"<>|#^[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return `${sanitized}.md`;
}

const MANAGED_KEYS = [
  "jira_key",
  "jira_summary",
  "jira_status",
  "jira_type",
  "jira_priority",
  "jira_assignee",
  "jira_reporter",
  "jira_labels",
  "jira_updated",
  "jira_url",
  "jira_synced_at",
] as const;

function managedPatch(details: IssueDetails): Frontmatter {
  return {
    jira_key: details.key,
    jira_summary: details.summary,
    jira_status: details.status,
    jira_type: details.type,
    jira_priority: details.priority,
    jira_assignee: details.assignee,
    jira_reporter: details.reporter,
    jira_labels: details.labels,
    jira_updated: details.updated,
    jira_url: details.url,
    jira_synced_at: new Date().toISOString(),
  };
}

function initialBody(details: IssueDetails): string {
  return `# ${details.key} — ${details.summary}

[Open in JIRA](${details.url})

## Notes

`;
}

export async function writeStub(
  vault: VaultAdapter,
  stubsFolder: string,
  details: IssueDetails,
  existingPath: string | null = null,
): Promise<void> {
  const folder = stubsFolder.replace(/^\/+|\/+$/g, "");
  await vault.ensureFolder(folder);

  const patch = managedPatch(details);

  if (existingPath !== null) {
    const existing = await vault.read(existingPath);
    if (existing !== null) {
      const updated = writeFrontmatter(existing, patch);
      if (updated === null) {
        throw new Error(
          `Could not round-trip frontmatter in ${existingPath}; stub skipped`,
        );
      }
      await vault.write(existingPath, updated);
      return;
    }
  }

  const path = `${folder}/${stubFileName(details)}`;
  const withFm = writeFrontmatter(initialBody(details), patch);
  if (withFm === null) {
    throw new Error("Failed to emit frontmatter for new stub");
  }
  await vault.write(path, withFm);
}

export { MANAGED_KEYS };
// Ensure readFrontmatter is used (silences unused import warning if any).
void readFrontmatter;
