/** One titled or untitled section of task output. */
export interface TaskResultBlock {
  title?: string;
  description: string;
}

/** Display data for one completed OMP task. */
export interface TaskResultPanel {
  id: string;
  metadata: string[];
  blocks: TaskResultBlock[];
}

interface StructuredFinding {
  title?: unknown;
  body?: unknown;
}

/** Converts an OMP task-result envelope into display-ready fields. */
export function formatTaskResultPanel(
  content: string,
): TaskResultPanel | undefined {
  const taskResult = content.match(
    /<task-result\b([^>]*)>([\s\S]*?)<\/task-result>/,
  );
  if (!taskResult) return;

  const attributes = Object.fromEntries(
    [...taskResult[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  const output = taskResult[2].match(/<output>\s*([\s\S]*?)\s*<\/output>/);
  const outputText = output?.[1].trim() ?? taskResult[2].trim();

  return {
    id: attributes.id ?? "unknown",
    metadata: [attributes.agent, attributes.status, attributes.duration].filter(
      (value): value is string => Boolean(value),
    ),
    blocks: formatOutput(outputText),
  };
}

/** Groups structured findings and preserves every other task output. */
function formatOutput(output: string): TaskResultBlock[] {
  const findings = parseFindings(output);
  if (!findings) return [{ description: output }];
  if (findings.length === 0) return [{ description: "No findings." }];

  return findings.map((finding) => ({
    title: typeof finding.title === "string" ? finding.title : "Finding",
    description: typeof finding.body === "string" ? finding.body : "",
  }));
}

/** Reads the optional structured-findings output shape. */
function parseFindings(output: string): StructuredFinding[] | undefined {
  try {
    const value = JSON.parse(output) as { findings?: unknown };
    return Array.isArray(value.findings) ? value.findings : undefined;
  } catch {
    return;
  }
}
