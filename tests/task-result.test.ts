import { describe, expect, test } from "bun:test";
import { formatTaskResultPanel } from "../src/task-result";

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
      blocks: [{ description: "Migrated 24 records." }],
    });
  });

  test("keeps multiple structured results as separate title-description blocks", () => {
    const content = [
      '<task-result id="Audit" agent="task" status="completed">',
      "<output>",
      JSON.stringify({
        findings: [
          { title: "Missing retry", body: "Retry the transient request." },
          { title: "Missing timeout", body: "Bound the request duration." },
        ],
      }),
      "</output>",
      "</task-result>",
    ].join("\n");

    expect(formatTaskResultPanel(content)?.blocks).toEqual([
      {
        title: "Missing retry",
        description: "Retry the transient request.",
      },
      {
        title: "Missing timeout",
        description: "Bound the request duration.",
      },
    ]);
  });

  test("formats spilled output as a preview or expanded artifact", () => {
    const content = [
      '<task-result id="LargeTask" agent="task" status="completed">',
      '<meta lines="80" size="19.7KB" />',
      '<preview full-output="agent://LargeTask">{</preview>',
      "</task-result>",
    ].join("\n");

    expect(formatTaskResultPanel(content)).toEqual({
      id: "LargeTask",
      metadata: ["task", "completed", "19.7KB"],
      blocks: [{ description: "Full output is collapsed." }],
      hasFullOutput: true,
    });
    expect(
      formatTaskResultPanel(
        content,
        JSON.stringify({ text: "Full output paragraph." }),
      )?.blocks,
    ).toEqual([{ description: "Full output paragraph." }]);
  });

  test("rejects content without a task-result envelope", () => {
    expect(formatTaskResultPanel("ordinary message")).toBeUndefined();
  });
});
