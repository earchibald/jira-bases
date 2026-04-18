export interface IssueFields {
  key: string;
  summary: string;
  status: string;
  type: string;
  url: string;
}

const KNOWN_TOKENS: ReadonlyArray<keyof IssueFields> = [
  "key",
  "summary",
  "status",
  "type",
  "url",
];

export function renderTemplate(template: string, fields: IssueFields): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, name: string) => {
    if ((KNOWN_TOKENS as readonly string[]).includes(name)) {
      return fields[name as keyof IssueFields] ?? "";
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
