import { describe, expect, it } from "vitest";
import JiraBasesPlugin from "./main";

type Cursor = { line: number; ch: number };

function makeEditor(lines: string[], from: Cursor, to: Cursor) {
  const calls: Array<{ from: Cursor; to: Cursor }> = [];
  const selection =
    from.line === to.line
      ? lines[from.line].slice(from.ch, to.ch)
      : `${lines[from.line].slice(from.ch)}\n${lines[to.line].slice(0, to.ch)}`;

  return {
    calls,
    editor: {
      getSelection: () => selection,
      getCursor: (which?: "from" | "to") => (which === "from" ? from : to),
      getLine: (line: number) => lines[line],
      setSelection: (nextFrom: Cursor, nextTo: Cursor) => {
        calls.push({ from: nextFrom, to: nextTo });
      },
    },
  };
}

describe("expandSelectionToIssueReference", () => {
  it("widens a partial selection inside a rewritable markdown link", () => {
    const line = "text [SRE-1](https://jira.me.com/browse/SRE-1) more";
    const { editor, calls } = makeEditor([line], { line: 0, ch: 12 }, { line: 0, ch: 18 });
    const plugin = new JiraBasesPlugin({} as any, {} as any);

    const expanded = (plugin as any).expandSelectionToIssueReference(
      editor,
      "https://jira.me.com",
    );

    expect(expanded).toBe("[SRE-1](https://jira.me.com/browse/SRE-1)");
    expect(calls).toEqual([{ from: { line: 0, ch: 5 }, to: { line: 0, ch: 46 } }]);
  });

  it("does not fall through to bare-key expansion inside a non-JIRA markdown link", () => {
    const line = "text [SRE-1](https://elsewhere.example.com/docs/SRE-1) more";
    const { editor, calls } = makeEditor([line], { line: 0, ch: 12 }, { line: 0, ch: 18 });
    const plugin = new JiraBasesPlugin({} as any, {} as any);

    const expanded = (plugin as any).expandSelectionToIssueReference(
      editor,
      "https://jira.me.com",
    );

    expect(expanded).toBe(line.slice(12, 18));
    expect(calls).toEqual([]);
  });

  it("leaves multi-line selections unchanged", () => {
    const lines = [
      "text [SRE-1](https://jira.me.com/browse/SRE-1)",
      "next line",
    ];
    const { editor, calls } = makeEditor(lines, { line: 0, ch: 12 }, { line: 1, ch: 4 });
    const plugin = new JiraBasesPlugin({} as any, {} as any);
    const selection = editor.getSelection();

    const expanded = (plugin as any).expandSelectionToIssueReference(
      editor,
      "https://jira.me.com",
    );

    expect(expanded).toBe(selection);
    expect(calls).toEqual([]);
  });
});
