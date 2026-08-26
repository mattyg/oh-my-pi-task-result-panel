import { describe, expect, test } from "bun:test";
import { resolveTaskArtifactPath } from "./task-artifact";

describe("resolveTaskArtifactPath", () => {
  test("resolves an agent output within its session artifact directory", () => {
    const content =
      '<preview full-output="agent://LargeTask">Short preview.</preview>';

    expect(resolveTaskArtifactPath(content, "/sessions/run.jsonl")).toBe(
      "/sessions/run/LargeTask.md",
    );
  });

  test("rejects output references that can escape the artifact directory", () => {
    const content =
      '<preview full-output="agent://../../secret">Short preview.</preview>';

    expect(
      resolveTaskArtifactPath(content, "/sessions/run.jsonl"),
    ).toBeUndefined();
  });
});
