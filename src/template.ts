import type { IssueDetails } from "./jira-fields";

export interface IssueFields {
  key: string;
  summary: string;
  status: string;
  type: string;
  url: string;
}

const KNOWN_TOKENS: ReadonlyArray<keyof IssueDetails> = [
  "key",
  "summary",
  "status",
  "type",
  "priority",
  "assignee",
  "reporter",
  "labels",
  "updated",
  "url",
];

export function renderTemplate(
  template: string,
  fields: IssueFields | IssueDetails,
): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) => {
    if ((KNOWN_TOKENS as readonly string[]).includes(name)) {
      const key = name as keyof IssueDetails;
      if (!(key in fields)) {
        return "";
      }
      const value = (fields as IssueDetails)[key];
      if (Array.isArray(value)) {
        return value.join(", ");
      }
      return value ?? "";
    }
    return match;
  });
}

/**
 * Escape characters that would break Markdown link text (`[...]`) or be
 * interpreted as HTML by Obsidian's renderer (e.g. `<env>` becoming an HTML
 * tag). Backslash-escapes `[`, `]`, `\`, `<`, `>`. Safe to apply repeatedly
 * — backslashes get escaped first so we don't double-escape.
 */
export function escapeLinkText(text: string): string {
  return text.replace(/([\\\[\]<>])/g, "\\$1");
}

/**
 * Escape characters that would break Markdown link URLs (`(...)`). Encodes
 * spaces as `%20` and percent-encodes `(` and `)` so an unescaped paren in a
 * JIRA URL doesn't terminate the link early.
 */
export function escapeLinkUrl(url: string): string {
  return url.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}
