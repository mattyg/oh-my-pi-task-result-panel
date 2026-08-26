import { describe, expect, test } from "bun:test";
import taskResultPanel from "./index";

interface RenderedComponent {
  render(width: number): readonly string[];
}

type Renderer = (
  message: { content: string },
  options: { expanded: boolean },
  theme: {
    fg(color: string, text: string): string;
    bold(text: string): string;
  },
) => RenderedComponent | undefined;

type SessionStart = (
  event: unknown,
  context: {
    sessionManager: { getBranch(): unknown[] };
    setInterval(callback: () => void): void;
  },
) => Promise<void>;

interface SentMessage {
  customType?: string;
  content: string;
  role?: "custom";
  timestamp?: number;
}

describe("task result extension", () => {
  test("only mirrors results that arrive after session startup", async () => {
    let poll: (() => void) | undefined;
    let render: Renderer | undefined;
    let start: SessionStart | undefined;
    const sent: SentMessage[] = [];
    const entries: unknown[] = [
      {
        id: "historical-entry",
        type: "custom_message",
        customType: "async-result",
        content: [
          '<task-result id="HistoricalTask" agent="task" status="completed">',
          "<output>Already displayed before resume.</output>",
          "</task-result>",
        ].join("\n"),
      },
    ];

    taskResultPanel({
      registerMessageRenderer(type: string, callback: Renderer) {
        if (type === "task-result-panel") render = callback;
      },
      on(event: string, callback: SessionStart) {
        if (event === "session_start") start = callback;
      },
      sendMessage(message: SentMessage) {
        sent.push(message);
      },
    } as never);

    await start?.({}, {
      sessionManager: { getBranch: () => entries },
      // Capture OMP's managed interval so the test drives it synchronously.
      setInterval(callback: () => void) {
        poll = callback;
      },
    });
    poll?.();

    expect(sent).toHaveLength(0);

    entries.push({
      id: "new-entry",
      type: "custom_message",
      customType: "async-result",
      content: [
        '<task-result id="Audit" agent="task" status="completed">',
        "<output>",
        JSON.stringify({
          findings: [
            { title: "First result", body: "First description." },
            { title: "Second result", body: "Second description." },
          ],
        }),
        "</output>",
        "</task-result>",
      ].join("\n"),
    });
    poll?.();

    expect(sent).toHaveLength(1);
    expect(sent[0].customType).toBe("task-result-panel");

    const component = render?.(
      { ...sent[0], role: "custom", timestamp: Date.now() },
      { expanded: true },
      {
        fg: (_color: string, text: string) => text,
        bold: (text: string) => `<b>${text}</b>`,
      },
    );
    const output = component
      ?.render(120)
      .map((line) => line.trim())
      .join("\n");

    expect(output).toContain("<b>Task result · Audit</b>");
    expect(output).toContain(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n<b>Task result · Audit</b>",
    );
    expect(output).toContain(
      "<b>First result</b>\nFirst description.\n\n<b>Second result</b>",
    );
    expect(output).toContain(
      "Second description.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━",
    );
    expect(output).not.toContain("•");
  });
});
