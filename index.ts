/** Renders completed OMP tasks as readable transcript panels. */
import { readFileSync, statSync } from "node:fs";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@oh-my-pi/pi-coding-agent";
import { Container, Spacer, Text } from "@oh-my-pi/pi-tui";
import { resolveTaskArtifactPath } from "./task-artifact";
import { formatTaskResultPanel } from "./task-result";

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

interface PanelDetails {
  fullOutputPath?: string;
}

/** Registers automatic task-result watching and panel rendering. */
export default function taskResultPanel(pi: ExtensionAPI) {
  let sessionFile: string | undefined;
  pi.registerMessageRenderer<PanelDetails>(
    PANEL_MESSAGE_TYPE,
    (message, options, theme) => {
      const content =
        typeof message.content === "string" ? message.content : "";
      const fullOutputPath =
        message.details?.fullOutputPath ??
        resolveTaskArtifactPath(content, sessionFile);
      const fullOutput = options.expanded
        ? readTaskOutput(fullOutputPath)
        : undefined;
      const result = formatTaskResultPanel(content, fullOutput);
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
      if (result.hasFullOutput && !options.expanded) {
        panel.addChild(new Spacer(1));
        panel.addChild(
          new Text(
            theme.fg("dim", "Ctrl+O or Alt+O to expand full output"),
            1,
            0,
          ),
        );
      }
      if (result.hasFullOutput && options.expanded && fullOutput === undefined) {
        panel.addChild(new Spacer(1));
        panel.addChild(
          new Text(theme.fg("dim", "Full output is unavailable"), 1, 0),
        );
      }
      panel.addChild(new Spacer(1));
      panel.addChild(
        new Text(theme.fg("accent", "━━━━━━━━━━━━━━━━━━━━━━━━━━"), 1, 0),
      );
      return panel;
    },
  );

  pi.registerCommand("task-results-toggle", {
    description: "Expand or collapse task result panels",
    handler: (_args, ctx) => toggleTaskResults(ctx),
  });
  pi.registerShortcut("alt+o", {
    description: "Expand or collapse task result panels",
    handler: toggleTaskResults,
  });

  // OMP owns the async-result renderer, so mirror new results to our type.
  pi.on("session_start", async (_event, ctx) => {
    sessionFile = ctx.sessionManager.getSessionFile();
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
        const fullOutputPath = resolveTaskArtifactPath(
          entry.content,
          sessionFile,
        );
        pi.sendMessage(
          {
            customType: PANEL_MESSAGE_TYPE,
            content: entry.content,
            display: true,
            attribution: "agent",
            ...(fullOutputPath ? { details: { fullOutputPath } } : {}),
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

/** Reads a bounded task artifact only when the panel is expanded. */
function readTaskOutput(path: string | undefined): string | undefined {
  if (!path) return;

  try {
    if (statSync(path).size > MAX_EXPANDED_OUTPUT_BYTES) return;
    return readFileSync(path, "utf8");
  } catch {
    return;
  }
}

/** Toggles the OMP expansion state used by task result renderers. */
function toggleTaskResults(ctx: ExtensionContext): void {
  ctx.ui.setToolsExpanded(!ctx.ui.getToolsExpanded());
}
