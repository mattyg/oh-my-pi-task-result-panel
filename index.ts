/** Renders completed OMP tasks as readable transcript panels. */
import { readFileSync, statSync } from "node:fs";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@oh-my-pi/pi-coding-agent";
import { Container, Spacer, Text } from "@oh-my-pi/pi-tui";
import { resolveTaskArtifactPath } from "./task-artifact";
import {
  extractTaskArtifactText,
  formatTaskResultPanel,
} from "./task-result";

const TASK_RESULT_TAG = "<task-result";
const PANEL_MESSAGE_TYPE = "task-result-panel";
const MAX_EXPANDED_OUTPUT_BYTES = 8 * 1024 * 1024;

/** Minimal session entry shape used by the result watcher. */
interface SessionEntry {
  id?: string;
  type: string;
  customType?: string;
  content?: unknown;
}


/** Registers automatic task-result watching and panel rendering. */
export default function taskResultPanel(pi: ExtensionAPI) {
  pi.registerMessageRenderer(
    PANEL_MESSAGE_TYPE,
    (message, _options, theme) => {
      const content =
        typeof message.content === "string" ? message.content : "";
      const result = formatTaskResultPanel(content);
      if (!result) return;

      const panel = new Container();
      panel.addChild(
        new Text(theme.fg("accent", "━━━━━━━━━━━━━━━━━━━━━━━━━━"), 1, 0),
      );
      panel.addChild(new Spacer(1));
      panel.addChild(
        new Text(
          theme.bold(theme.fg("accent", `Task result · ${result.id}`)),
          1,
          0,
        ),
      );
      panel.addChild(
        new Text(theme.fg("dim", result.metadata.join(" · ")), 1, 0),
      );
      panel.addChild(new Spacer(1));
      result.blocks.forEach((block, index) => {
        if (index > 0) panel.addChild(new Spacer(1));
        if (block.title) {
          panel.addChild(new Text(theme.bold(block.title), 1, 0));
        }
        if (block.description) {
          panel.addChild(new Text(block.description, 1, 0));
        }
      });
      if (result.hasFullOutput) {
        panel.addChild(new Spacer(1));
        panel.addChild(
          new Text(
            theme.fg(
              "dim",
              `/task-results-view ${result.id} opens the full output`,
            ),
            1,
            0,
          ),
        );
      }
      panel.addChild(new Spacer(1));
      panel.addChild(
        new Text(theme.fg("accent", "━━━━━━━━━━━━━━━━━━━━━━━━━━"), 1, 0),
      );
      return panel;
    },
  );

  pi.registerCommand("task-results-view", {
    description: "Open the full output for a task result",
    handler: viewTaskResult,
  });

  // OMP owns the async-result renderer, so mirror new results to our type.
  pi.on("session_start", async (_event, ctx) => {
    const seenEntryIds = new Set<string>();
    const existingEntries = ctx.sessionManager.getBranch() as SessionEntry[];
    for (const entry of existingEntries) {
      if (isTaskResultEntry(entry)) seenEntryIds.add(entry.id);
    }

    ctx.setInterval(() => {
      const entries = ctx.sessionManager.getBranch() as SessionEntry[];
      for (const entry of entries) {
        if (!isNewTaskResult(entry, seenEntryIds)) continue;
        seenEntryIds.add(entry.id);
        pi.sendMessage(
          {
            customType: PANEL_MESSAGE_TYPE,
            content: entry.content,
            display: true,
            attribution: "agent",
          },
          { triggerTurn: false },
        );
      }
    }, 500);
  });

}

type TaskResultEntry = SessionEntry & { id: string; content: string };

/** Returns whether an entry contains a completed subagent result. */
function isTaskResultEntry(entry: SessionEntry): entry is TaskResultEntry {
  return (
    entry.type === "custom_message" &&
    entry.customType === "async-result" &&
    typeof entry.id === "string" &&
    typeof entry.content === "string" &&
    entry.content.includes(TASK_RESULT_TAG)
  );
}

/** Returns whether a task result has not been mirrored yet. */
function isNewTaskResult(
  entry: SessionEntry,
  seenEntryIds: Set<string>,
): entry is TaskResultEntry {
  return isTaskResultEntry(entry) && !seenEntryIds.has(entry.id);
}

/** Reads a bounded task artifact for the focused viewer. */
function readTaskOutput(path: string | undefined): string | undefined {
  if (!path) return;

  try {
    if (statSync(path).size > MAX_EXPANDED_OUTPUT_BYTES) return;
    return readFileSync(path, "utf8");
  } catch {
    return;
  }
}

/** Opens the requested task artifact, or the latest one when omitted. */
async function viewTaskResult(
  taskId: string,
  ctx: ExtensionContext,
): Promise<void> {
  const result = findTaskResult(
    ctx.sessionManager.getBranch() as SessionEntry[],
    taskId.trim(),
  );
  if (!result) {
    ctx.ui.notify("No task result with full output was found", "warning");
    return;
  }

  const artifactPath = resolveTaskArtifactPath(
    result.content,
    ctx.sessionManager.getSessionFile(),
  );
  const output = readTaskOutput(artifactPath);
  if (output === undefined) {
    ctx.ui.notify("The full task output is unavailable", "warning");
    return;
  }

  await ctx.ui.editor(
    `Task result · ${result.id}`,
    extractTaskArtifactText(output),
  );
}

/** Finds a spilled task result by id, preferring the latest match. */
function findTaskResult(
  entries: SessionEntry[],
  taskId: string,
): { id: string; content: string } | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (typeof entry.content !== "string") continue;
    const result = formatTaskResultPanel(entry.content);
    if (!result?.hasFullOutput) continue;
    if (taskId && result.id !== taskId) continue;
    return { id: result.id, content: entry.content };
  }
  return;
}
