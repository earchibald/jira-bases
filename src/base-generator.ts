export interface BaseConfig {
  columns: string[];
  stubsFolder: string;
  viewName?: string;
}

const COLUMN_TO_FIELD: Record<string, string> = {
  key: "jira_key",
  summary: "jira_summary",
  status: "jira_status",
  type: "jira_type",
  priority: "jira_priority",
  assignee: "jira_assignee",
  reporter: "jira_reporter",
  labels: "jira_labels",
  updated: "jira_updated",
  url: "jira_url",
};

function escapeFolderPath(folder: string): string {
  const normalized = folder.replace(/^\/+|\/+$/g, "");
  // Escape double quotes and backslashes for YAML string
  return normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function emitOrderList(columns: string[]): string {
  const fields = ["file.name"];
  for (const col of columns) {
    const field = COLUMN_TO_FIELD[col];
    if (field) {
      fields.push(field);
    }
  }
  return fields.map((f) => `      - ${f}`).join("\n");
}

export function generateBase(config: BaseConfig): string {
  const { columns, stubsFolder, viewName = "All issues" } = config;
  const escapedFolder = escapeFolderPath(stubsFolder);
  const orderLines = emitOrderList(columns);

  return `filters:
  and:
    - file.inFolder("${escapedFolder}")
views:
  - type: table
    name: "${viewName}"
    order:
${orderLines}
`;
}
