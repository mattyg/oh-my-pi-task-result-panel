/** Renders completed OMP tasks as readable transcript panels. */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Container, Text } from "@oh-my-pi/pi-tui";
import { formatTaskResultPanel } from "./task-result";

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
    const result = formatTaskResultPanel(content);
    if (!result) return;

    const panel = new Container();
    panel.addChild(
      new Text(
        theme.fg("accent", `━━━ Task result · ${result.id} ━━━`),
        1,
        0,
      ),
    );
    panel.addChild(
      new Text(theme.fg("dim", result.metadata.join(" · ")), 1, 0),
    );
    for (const section of result.lines) {
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
    description: "Show a sample task result panel",
    handler: async (_args, ctx) => {
      pi.sendMessage(
        {
          customType: PANEL_MESSAGE_TYPE,
          content: [
            "Background job DataMigration has completed.",
            '<task-result id="DataMigration" agent="task" status="completed">',
            "<output>",
            "Migrated 24 records.",
            "</output>",
            "</task-result>",
          ].join("\n"),
          display: true,
          attribution: "agent",
        },
        { triggerTurn: false },
      );
      ctx.ui.notify("Added a sample task result", "info");
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
