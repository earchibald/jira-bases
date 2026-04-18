export function isIssueKey(input: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]+-\d+$/.test(input);
}

export function escapeJqlText(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
