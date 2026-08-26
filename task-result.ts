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
  hasFullOutput?: boolean;
}

interface StructuredFinding {
  title?: unknown;
  body?: unknown;
}

/** Converts an OMP task-result envelope into display-ready fields. */
export function formatTaskResultPanel(
  content: string,
  fullOutput?: string,
): TaskResultPanel | undefined {
  const taskResult = content.match(
    /<task-result\b([^>]*)>([\s\S]*?)<\/task-result>/,
  );
  if (!taskResult) return;

  const attributes = parseAttributes(taskResult[1]);
  const metadata = taskResult[2].match(/<meta\b([^>]*)\/?>/);
  const metadataAttributes = parseAttributes(metadata?.[1] ?? "");
  const output = taskResult[2].match(/<output>\s*([\s\S]*?)\s*<\/output>/);
  const preview = taskResult[2].match(
    /<preview\b[^>]*full-output="agent:\/\/[^"]+"[^>]*>\s*([\s\S]*?)\s*<\/preview>/,
  );
  const previewText = preview?.[1].trim();
  const outputText =
    fullOutput ??
    output?.[1].trim() ??
    (previewText ? presentPreview(previewText) : taskResult[2].trim());

  return {
    id: attributes.id ?? "unknown",
    metadata: [
      attributes.agent,
      attributes.status,
      attributes.duration,
      ...(preview ? [metadataAttributes.size] : []),
    ].filter((value): value is string => Boolean(value)),
    blocks: formatOutput(outputText),
    ...(preview ? { hasFullOutput: true } : {}),
  };
}

/** Parses quoted task-envelope attributes. */
function parseAttributes(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

/** Replaces structural fragments with a useful collapsed-state message. */
function presentPreview(preview: string): string {
  const meaningfulCharacters = preview.match(/[A-Za-z0-9]/g)?.length ?? 0;
  return meaningfulCharacters >= 4 ? preview : "Full output is collapsed.";
}

/** Groups structured findings and preserves every other task output. */
function formatOutput(output: string): TaskResultBlock[] {
  const structured = parseStructuredOutput(output);
  if (structured && typeof structured.text === "string") {
    return [{ description: structured.text }];
  }

  const findings = structured?.findings;
  if (!Array.isArray(findings)) return [{ description: output }];
  if (findings.length === 0) return [{ description: "No findings." }];

  return (findings as StructuredFinding[]).map((finding) => ({
    title: typeof finding.title === "string" ? finding.title : "Finding",
    description: typeof finding.body === "string" ? finding.body : "",
  }));
}

/** Reads optional structured output without rejecting plain text. */
function parseStructuredOutput(
  output: string,
): { text?: unknown; findings?: unknown } | undefined {
  try {
    const value: unknown = JSON.parse(output);
    return value !== null && typeof value === "object" ? value : undefined;
  } catch {
    return;
  }
}
