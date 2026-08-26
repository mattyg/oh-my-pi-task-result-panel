/** Renders completed OMP tasks as readable transcript panels. */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { Container, Spacer, Text } from "@oh-my-pi/pi-tui";
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

/** Registers automatic task-result watching and panel rendering. */
export default function taskResultPanel(pi: ExtensionAPI) {
  pi.registerMessageRenderer(PANEL_MESSAGE_TYPE, (message, _options, theme) => {
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
    panel.addChild(new Spacer(1));
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
