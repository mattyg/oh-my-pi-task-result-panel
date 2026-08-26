import { describe, expect, test } from "bun:test";
import { formatTaskResultPanel } from "./task-result";

describe("formatTaskResultPanel", () => {
  test("formats a generic OMP task result without XML", () => {
    const content = [
      "Background job DataMigration has completed.",
      '<task-result id="DataMigration" agent="task" status="completed" duration="42s">',
      "<output>",
      "Migrated 24 records.",
      "</output>",
      "</task-result>",
    ].join("\n");

    expect(formatTaskResultPanel(content)).toEqual({
      id: "DataMigration",
      metadata: ["task", "completed", "42s"],
      lines: ["Migrated 24 records."],
    });
  });

  test("formats structured findings as readable lines", () => {
    const content = [
      '<task-result id="Audit" agent="task" status="completed">',
      "<output>",
      JSON.stringify({
        findings: [{ title: "Missing retry", body: "Retry the transient request." }],
      }),
      "</output>",
      "</task-result>",
    ].join("\n");

    expect(formatTaskResultPanel(content)?.lines).toEqual([
      "• Missing retry",
      "Retry the transient request.",
    ]);
  });

  test("rejects content without a task-result envelope", () => {
    expect(formatTaskResultPanel("ordinary message")).toBeUndefined();
  });
});
