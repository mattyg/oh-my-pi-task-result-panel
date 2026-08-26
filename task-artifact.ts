import { join } from "node:path";

const AGENT_OUTPUT_REFERENCE =
  /<preview\b[^>]*full-output="agent:\/\/([^"]+)"[^>]*>/;
const SAFE_AGENT_OUTPUT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Resolves an agent output reference inside the current session artifact tree. */
export function resolveTaskArtifactPath(
  content: string,
  sessionFile: string | undefined,
): string | undefined {
  if (!sessionFile?.endsWith(".jsonl")) return;
  const outputId = content.match(AGENT_OUTPUT_REFERENCE)?.[1];
  if (
    !outputId ||
    !SAFE_AGENT_OUTPUT_ID.test(outputId) ||
    outputId.includes("..")
  ) {
    return;
  }

  const artifactDirectory = sessionFile.slice(0, -".jsonl".length);
  return join(artifactDirectory, `${outputId}.md`);
}
