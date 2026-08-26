/** Renders completed OMP reviewer tasks as readable transcript panels. */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Container, Text } from "@oh-my-pi/pi-tui";

const TASK_RESULT_TAG = "<task-result";
const PANEL_MESSAGE_TYPE = "task-result-panel";

/** Minimal session entry shape used by the result watcher. */
interface SessionEntry {
  id?: string;
  type: string;
  customType?: string;
  content?: unknown;
}

/** Registers result watching, panel rendering, and the demo command. */
export default function taskResultPanel(pi: ExtensionAPI) {
  pi.registerMessageRenderer(PANEL_MESSAGE_TYPE, (message, _options, theme) => {
    const content =
      typeof message.content === "string" ? message.content : "";
    const result = parseTaskResult(content);
    if (!result) return;

    const panel = new Container();
    panel.addChild(
      new Text(
        theme.fg("accent", `━━━ Reviewer result · ${result.id} ━━━`),
        1,
        0,
      ),
    );
    panel.addChild(
      new Text(
        theme.fg(
          "dim",
          [result.agent, result.status, result.duration]
            .filter(Boolean)
            .join(" · "),
        ),
        1,
        0,
      ),
    );
    for (const section of formatOutput(result.output)) {
      panel.addChild(new Text(section, 1, 0));
    }
    panel.addChild(
      new Text(theme.fg("accent", "━━━━━━━━━━━━━━━━━━━━━━━━━━"), 1, 0),
    );
    return panel;
  });

  // OMP owns the async-result renderer, so mirror new results to our type.
  pi.on("session_start", async (_event, ctx) => {
    const seenEntryIds = new Set<string>();

    ctx.setInterval(() => {
      const entries = ctx.sessionManager.getBranch() as SessionEntry[];
      for (const entry of entries) {
        if (!isNewTaskResult(entry, seenEntryIds)) continue;
        seenEntryIds.add(entry.id!);
        pi.sendMessage(
          {
            customType: PANEL_MESSAGE_TYPE,
            content: entry.content as string,
            display: true,
            attribution: "agent",
          },
          { triggerTurn: false },
        );
      }
    }, 500);
  });

  pi.registerCommand("task-result-panel-demo", {
    description: "Show a sample reviewer result panel",
    handler: async (_args, ctx) => {
      pi.sendMessage(
        {
          customType: PANEL_MESSAGE_TYPE,
          content: [
            "Background job DemoReview has completed.",
            '<task-result id="DemoReview" agent="reviewer" status="completed">',
            "<output>",
            "No findings. The task-result panel is working.",
            "</output>",
            "</task-result>",
          ].join("\n"),
          display: true,
          attribution: "agent",
        },
        { triggerTurn: false },
      );
      ctx.ui.notify("Added a sample reviewer result", "info");
    },
  });
}

/** Returns whether an unseen entry contains a completed subagent result. */
function isNewTaskResult(
  entry: SessionEntry,
  seenEntryIds: Set<string>,
): boolean {
  return (
    entry.type === "custom_message" &&
    entry.customType === "async-result" &&
    typeof entry.id === "string" &&
    !seenEntryIds.has(entry.id) &&
    typeof entry.content === "string" &&
    entry.content.includes(TASK_RESULT_TAG)
  );
}

/** Fields exposed by OMP's task-result envelope. */
interface TaskResult {
  id: string;
  agent?: string;
  status?: string;
  duration?: string;
  output: string;
}

/** Reviewer JSON fields rendered specially when present. */
interface ReviewFinding {
  title?: unknown;
  body?: unknown;
}

/** Extracts metadata and output while discarding the XML envelope. */
function parseTaskResult(content: string): TaskResult | undefined {
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

  return {
    id: attributes.id ?? "unknown",
    agent: attributes.agent,
    status: attributes.status,
    duration: attributes.duration,
    output: output?.[1].trim() ?? taskResult[2].trim(),
  };
}

/** Formats structured findings or falls back to the raw output. */
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

/** Reads the common reviewer JSON shape without rejecting plain text. */
function parseFindings(output: string): ReviewFinding[] | undefined {
  try {
    const value = JSON.parse(output) as { findings?: unknown };
    return Array.isArray(value.findings) ? value.findings : undefined;
  } catch {
    return;
  }
}
