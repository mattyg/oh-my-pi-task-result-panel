import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import taskResultPanel from "../src/index";

interface RenderedComponent {
  render(width: number): readonly string[];
}

type Renderer = (
  message: { content: string; details?: unknown },
  options: { expanded: boolean },
  theme: {
    fg(color: string, text: string): string;
    bold(text: string): string;
  },
) => RenderedComponent | undefined;

type SessionStart = (
  event: unknown,
  context: {
    sessionManager: {
      getBranch(): unknown[];
      getSessionFile(): string | undefined;
    };
    setInterval(callback: () => void): void;
  },
) => Promise<void>;

interface SentMessage {
  customType?: string;
  content: string;
  role?: "custom";
  timestamp?: number;
  details?: unknown;
}

interface ViewerContext {
  sessionManager: {
    getBranch(): unknown[];
    getSessionFile(): string | undefined;
  };
  ui: {
    editor(title: string, content: string): Promise<string | undefined>;
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
}

type CommandHandler = (
  args: string,
  context: ViewerContext,
) => Promise<void> | void;

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("task result extension", () => {
  test("only mirrors results that arrive after session startup", async () => {
    let poll: (() => void) | undefined;
    let render: Renderer | undefined;
    let start: SessionStart | undefined;
    let viewCommand: CommandHandler | undefined;
    let viewedTitle: string | undefined;
    let viewedContent: string | undefined;
    const sent: SentMessage[] = [];
    const temporaryRoot = await mkdtemp(
      join(tmpdir(), "omp-task-result-panel-"),
    );
    temporaryRoots.push(temporaryRoot);
    const sessionFile = join(temporaryRoot, "session.jsonl");
    const artifactDirectory = join(temporaryRoot, "session");
    await mkdir(artifactDirectory);
    await writeFile(
      join(artifactDirectory, "LargeTask.md"),
      JSON.stringify({ text: "Full output paragraph." }),
    );
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
      registerCommand(
        name: string,
        options: { handler: CommandHandler },
      ) {
        if (name === "task-results-view") viewCommand = options.handler;
      },
      sendMessage(message: SentMessage) {
        sent.push(message);
      },
    } as never);


    await start?.({}, {
      sessionManager: {
        getBranch: () => entries,
        getSessionFile: () => sessionFile,
      },
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

    entries.push({
      id: "large-entry",
      type: "custom_message",
      customType: "async-result",
      content: [
        '<task-result id="LargeTask" agent="task" status="completed">',
        '<meta lines="80" size="19.7KB" />',
        '<preview full-output="agent://LargeTask">Short preview.</preview>',
        "</task-result>",
      ].join("\n"),
    });
    poll?.();

    expect(sent).toHaveLength(2);
    const collapsed = render?.(
      { content: sent[1].content },
      { expanded: true },
      {
        fg: (_color: string, text: string) => text,
        bold: (text: string) => `<b>${text}</b>`,
      },
    );
    const collapsedOutput = collapsed?.render(120).join("\n");

    expect(collapsedOutput).toContain("Short preview.");
    expect(collapsedOutput).toContain("/task-results-view LargeTask");
    expect(collapsedOutput).not.toContain("Full output paragraph.");

    await viewCommand?.("LargeTask", {
      sessionManager: {
        getBranch: () => entries,
        getSessionFile: () => sessionFile,
      },
      ui: {
        editor: async (title, content) => {
          viewedTitle = title;
          viewedContent = content;
          return;
        },
        notify: () => {},
      },
    });

    expect(viewedTitle).toBe("Task result · LargeTask");
    expect(viewedContent).toBe("Full output paragraph.");
  });
});
