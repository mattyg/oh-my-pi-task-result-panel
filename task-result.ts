/** Display data for one completed OMP task. */
export interface TaskResultPanel {
  id: string;
  metadata: string[];
  lines: string[];
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
    lines: formatOutput(outputText),
  };
}

/** Formats structured findings and preserves every other task output. */
function formatOutput(output: string): string[] {
  const findings = parseFindings(output);
  if (!findings) return [output];
  if (findings.length === 0) return ["No findings."];

  return findings.flatMap((finding) => {
    const title =
      typeof finding.title === "string" ? `• ${finding.title}` : "• Finding";
    const body = typeof finding.body === "string" ? finding.body : "";
    return body ? [title, body] : [title];
  });
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
