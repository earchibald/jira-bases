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
