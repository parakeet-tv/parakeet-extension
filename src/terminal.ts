// terminal.ts
import * as vscode from "vscode";
import { Terminal as TerminalProto } from "parakeet-proto"; // encodeTerminal* helpers
import * as path from "path";

// Remove common ANSI CSI sequences (for prompt detection)
const ANSI_CSI = /\x1B\[[0-9;?]*[ -/]*[@-~]/g;

function cwdLabelFromTerminal(t: vscode.Terminal): string | null {
  const uri = t.shellIntegration?.cwd as vscode.Uri | undefined;
  if (!uri) return null;

  // Always include the workspace folder name (multi-root safe).
  const rel = vscode.workspace.asRelativePath(
    uri,
    true /* includeWorkspaceFolder */
  );
  if (rel && rel !== uri.fsPath) {
    // Normalize slashes
    return rel.replace(/\\/g, "/");
  }

  // Not in a workspace folder — fall back to folder name or last segment.
  const ws = vscode.workspace.getWorkspaceFolder(uri);
  if (ws) return ws.name;
  return path.basename(uri.fsPath || "");
}

// --- helpers: basic API key/token redaction ---
type Redactor = {
  re: RegExp;
  replace: (match: string, ...groups: string[]) => string;
};

// Replace whole match with stars
const maskAll = (m: string) => "*".repeat(m.length);
// Replace a specific captured group with stars, keep the rest
const maskGroup =
  (groupIdx: number) =>
  (m: string, ...gs: string[]) =>
    m.replace(gs[groupIdx - 1], "*".repeat(gs[groupIdx - 1]?.length ?? 0));

const REDACTORS: Redactor[] = [
  // OpenAI (incl. sk-… variations)
  { re: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replace: maskAll },
  // GitHub tokens (ghp_, ghu_, gho_, ghs_)
  { re: /\bgh[pous]_[A-Za-z0-9]{36,}\b/g, replace: maskAll },
  // Slack tokens (very loose)
  { re: /\bxox[aboprst]-[A-Za-z0-9-]{10,}\b/g, replace: maskAll },
  // AWS Access Key IDs
  { re: /\bA(KIA|SIA)[0-9A-Z]{16}\b/g, replace: maskAll },
  // Google API keys
  { re: /\bAIza[0-9A-Za-z\-_]{35}\b/g, replace: maskAll },
  // Bearer <token>   → keep "Bearer " and mask token
  {
    re: /\b(bearer)\s+([A-Za-z0-9._\-]{20,})\b/gi,
    replace: (m, g1, g2) => `${g1} ${"*".repeat(g2.length)}`,
  },
];

function redactSecrets(text: string): string {
  let out = text;
  for (const { re, replace } of REDACTORS)
    out = out.replace(re, replace as any);
  return out;
}

/** Strip a trailing shell prompt-only line like "%", "$", or "#", with optional ANSI and spaces. */
function stripTrailingPromptLine(text: string): string {
  // Remove trailing CRLF/LF once while checking, but preserve original structure where possible.
  let s = text;
  // Loop in case multiple blank/prompt lines accumulate at the end
  // e.g., "%\n", "%\r\n", " \x1b[32m%\x1b[0m \n"
  for (;;) {
    // Peek last line (after removing final newline chars to inspect the actual line)
    const trimmed = s.replace(/[\r\n]+$/, "");
    const nlIdx = trimmed.lastIndexOf("\n");
    const line = (nlIdx >= 0 ? trimmed.slice(nlIdx + 1) : trimmed)
      .replace(ANSI_CSI, "") // ignore ANSI
      .trim();

    if (line === "%" || line === "$" || line === "#") {
      // Remove that last line + any trailing newlines
      s = s
        .slice(0, trimmed.length - line.length)
        .replace(/[ \t]*$/, "")
        .replace(/[\r\n]+$/, "");
      // Continue to collapse if more prompt-only lines stacked
      continue;
    }
    break;
  }
  return s;
}

/** Full sanitize: redact secrets and drop trailing prompt-only line. */
function sanitizeOutputChunk(raw: string): string {
  const redacted = redactSecrets(raw);
  return stripTrailingPromptLine(redacted);
}

/**
 * Start terminal streaming. Call this from startStream() in stream.ts
 * Pass a send() that ultimately calls stream.ts's sendFrame (which already queues).
 */
export function startTerminalStreaming(
  context: vscode.ExtensionContext,
  send: (bytes: Uint8Array) => void
) {
  if (instance) {
    // idempotent: rewire send & refresh snapshot
    instance.updateSender(send);
    instance.sendSnapshot();
    return;
  }
  instance = new TerminalStreamer(context, send);
  instance.start();
}

/** Stop terminal streaming and dispose all listeners. Call from stopStream(). */
export function stopTerminalStreaming() {
  instance?.dispose();
  instance = null;
}

// Keep a single active streamer per extension process.
let instance: TerminalStreamer | null = null;

// ---------- Implementation ----------

type PerTermCounters = { seq: number; nextExecId: number };
type ExecInfo = { termId: number; execId: number; reader?: Promise<void> };

class TerminalStreamer {
  private ctx: vscode.ExtensionContext;
  private send: (bytes: Uint8Array) => void;

  // Terminal id assignment & lookups
  private nextId = 1 >>> 0; // u32
  private ids = new WeakMap<vscode.Terminal, number>();
  private byId = new Map<number, vscode.Terminal>();

  // Per-terminal sequence counters
  private counters = new Map<number, PerTermCounters>();

  // Track currently active terminal id to flip isActive
  private activeId: number | null = null;

  // Track ongoing executions → execId + reader promise
  private execs = new WeakMap<vscode.TerminalShellExecution, ExecInfo>();

  private disposables: vscode.Disposable[] = [];
  private enc = new TextEncoder();

  private hasEmitted = new Map<number, boolean>();

  constructor(
    context: vscode.ExtensionContext,
    send: (bytes: Uint8Array) => void
  ) {
    this.ctx = context;
    this.send = send;
  }

  updateSender(send: (bytes: Uint8Array) => void) {
    this.send = send;
  }

  start() {
    // Seed ids for existing terminals and send a snapshot.
    for (const t of vscode.window.terminals) this.ensureId(t);
    this.sendSnapshot();

    // Events — all are lightweight and safe to attach only while streaming.
    this.disposables.push(
      vscode.window.onDidOpenTerminal((t) => this.onOpen(t)),
      vscode.window.onDidCloseTerminal((t) => this.onClose(t)),
      vscode.window.onDidChangeActiveTerminal((t) => this.onActiveChanged(t)),
      vscode.window.onDidChangeTerminalState((t) => this.onStateChanged(t)),
      vscode.window.onDidChangeTerminalShellIntegration?.((e) =>
        this.onShellIntegrationChanged(e)
      ) ?? { dispose() {} },
      // Name change event exists on some VS Code versions; fall back to state change if not present.
      (vscode.window as any).onDidChangeTerminalName
        ? (vscode.window as any).onDidChangeTerminalName((t: vscode.Terminal) =>
            this.onTitleChanged(t)
          )
        : { dispose() {} },
      vscode.window.onDidStartTerminalShellExecution((e) =>
        this.onExecStart(e)
      ),
      vscode.window.onDidEndTerminalShellExecution((e) => this.onExecEnd(e))
    );
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.execs = new WeakMap();
    this.ids = new WeakMap();
    this.byId.clear();
    this.counters.clear();
    this.activeId = null;
  }

  // ----------------- Event handlers -----------------

  private async onOpen(t: vscode.Terminal) {
    const id = this.ensureId(t);
    const meta = await this.describeTerminal(t, true);
    this.hasEmitted.set(id, false);
    this.send(
      TerminalProto.encodeTerminalOpen({
        id,
        name: meta.name,
        pid: meta.pid,
        cols: meta.cols,
        rows: meta.rows,
        cwd: cwdLabelFromTerminal(t),
        hasShellIntegration: meta.hasShellIntegration,
        isActive: id === this.activeId,
      })
    );
    // Refresh snapshot so late joiners get the new terminal in one go.
    this.sendSnapshot();
  }

  private onClose(t: vscode.Terminal) {
    const id = this.ids.get(t);
    if (!id) return;
    const exitCode = t.exitStatus?.code ?? undefined;
    this.send(
      TerminalProto.encodeTerminalClose(id, {
        at: Date.now(),
        exitCode,
        reason: undefined,
      })
    );
    // Remove from in-memory maps
    this.byId.delete(id);
    this.counters.delete(id);
    this.hasEmitted.delete(id);
    if (this.activeId === id) this.activeId = null;
    // And update snapshot
    this.sendSnapshot();
  }

  private onActiveChanged(next: vscode.Terminal | undefined) {
    const prevId = this.activeId;
    const nextId = next ? this.ensureId(next) : null;
    if (prevId && prevId !== nextId) {
      this.send(
        TerminalProto.encodeTerminalState(prevId, {
          at: Date.now(),
          isActive: false,
        })
      );
    }
    if (nextId && nextId !== prevId) {
      this.send(
        TerminalProto.encodeTerminalState(nextId, {
          at: Date.now(),
          isActive: true,
        })
      );
    }
    this.activeId = nextId;
    this.sendSnapshot(); // reflects active flag
  }

  private async onStateChanged(t: vscode.Terminal) {
    // Emits when focus/interaction/etc changes. We surface cwd/integration if available.
    const id = this.ensureId(t);
    const meta = await this.describeTerminal(t, false);
    this.send(
      TerminalProto.encodeTerminalState(id, {
        at: Date.now(),
        isActive: id === this.activeId ? true : undefined,
        cwd: cwdLabelFromTerminal(t),
        hasShellIntegration: meta.hasShellIntegration,
      })
    );
    this.sendSnapshot();
  }

  private async onShellIntegrationChanged(
    e: vscode.TerminalShellIntegrationChangeEvent
  ) {
    const t = e.terminal;
    const id = this.ensureId(t);
    const cwd = cwdLabelFromTerminal(t);
    const has = !!t.shellIntegration;
    this.send(
      TerminalProto.encodeTerminalState(id, {
        at: Date.now(),
        cwd,
        hasShellIntegration: has,
      })
    );
    this.sendSnapshot();
  }

  // VS Code <-> API: dimensions are on the terminal instance and change fires via onDidChangeTerminalDimensions
  private onDimensionsChanged(t: vscode.Terminal) {
    const id = this.ids.get(t);
    if (!id) return;
    const cols =
      (t as any).dimensions?.columns ??
      (t as any).dimensions?.cols ??
      undefined;
    const rows = (t as any).dimensions?.rows ?? undefined;
    if (typeof cols === "number" && typeof rows === "number") {
      this.send(
        TerminalProto.encodeTerminalResize(id, {
          at: Date.now(),
          cols,
          rows,
        })
      );
      this.sendSnapshot();
    }
  }

  private onTitleChanged(t: vscode.Terminal) {
    const id = this.ids.get(t);
    if (!id) return;
    this.send(
      TerminalProto.encodeTerminalTitle(id, {
        at: Date.now(),
        name: t.name,
      })
    );
    this.sendSnapshot();
  }

  private onExecStart(e: vscode.TerminalShellExecutionStartEvent) {
    const t = e.terminal;
    const id = this.ensureId(t);
    const ctr = this.ensureCounters(id);

    const execId = ctr.nextExecId++ >>> 0;
    const command = redactSecrets(e.execution.commandLine?.value);
    const cwd = cwdLabelFromTerminal(t);

    this.send(
      TerminalProto.encodeTerminalExecStart(id, {
        at: Date.now(),
        execId,
        command,
        cwd,
      })
    );

    // Begin reading the async output stream immediately to avoid missing data.
    try {
      const reader = this.readExecutionStream(id, execId, e.execution);
      this.execs.set(e.execution, { termId: id, execId, reader });
    } catch {
      // No stream available (no shell integration) — nothing to do.
    }
  }

  private onExecEnd(e: vscode.TerminalShellExecutionEndEvent) {
    const info = this.execs.get(e.execution);
    const t = e.terminal;
    const id = info?.termId ?? this.ids.get(t);
    if (!id) return;

    const done = async () => {
      try {
        await info?.reader;
      } catch {}
      this.send(
        TerminalProto.encodeTerminalExecEnd(id, {
          at: Date.now(),
          execId: info?.execId ?? 0,
          exitCode: e.exitCode ?? null,
        })
      );
    };
    void done();
  }

  // ----------------- Helpers -----------------

  private ensureId(t: vscode.Terminal): number {
    let id = this.ids.get(t);
    if (!id) {
      id = this.nextId++ >>> 0;
      this.ids.set(t, id);
      this.byId.set(id, t);
      this.ensureCounters(id);
      // Set activeId if this is the currently active terminal and we didn't know yet
      if (vscode.window.activeTerminal === t) this.activeId = id;
    }
    return id;
  }

  private ensureCounters(id: number): PerTermCounters {
    let c = this.counters.get(id);
    if (!c) {
      c = { seq: 0, nextExecId: 1 };
      this.counters.set(id, c);
    }
    return c;
  }

  private nextSeq(id: number): number {
    const c = this.ensureCounters(id);
    c.seq = (c.seq + 1) >>> 0;
    return c.seq;
  }

  /** Describe a terminal’s current metadata. If includeDims=true, fetch dims eagerly. */
  private async describeTerminal(t: vscode.Terminal, includeDims: boolean) {
    const dims = includeDims ? (t as any).dimensions : undefined;
    const cols = dims?.columns ?? dims?.cols ?? undefined;
    const rows = dims?.rows ?? undefined;

    let pid: number | null | undefined = undefined;
    try {
      pid = await t.processId;
    } catch {
      /* ignore */
    }

    return {
      name: t.name,
      pid: typeof pid === "number" ? pid : undefined,
      cols,
      rows,
      cwd: cwdLabelFromTerminal(t),
      hasShellIntegration: !!t.shellIntegration,
      creationOptions: t.creationOptions, // opaque; useful for diagnostics
    };
  }

  /** Send a full snapshot of all open terminals with small scrollback (none available from API → empty). */
  sendSnapshot() {
    const terms = vscode.window.terminals.map((t) => {
      const id = this.ensureId(t);
      const dims = (t as any).dimensions;
      const cols = dims?.columns ?? dims?.cols ?? undefined;
      const rows = dims?.rows ?? undefined;
      return {
        id,
        name: t.name,
        cols,
        rows,
        cwd: cwdLabelFromTerminal(t),
        hasShellIntegration: !!t.shellIntegration,
        createdAt: Date.now(), // VS Code doesn't expose creation time; approximate
        isActive: id === this.activeId,
        // We can’t read historical scrollback from VS Code → leave empty.
        scrollback: new Uint8Array(0),
      };
    });

    this.send(
      TerminalProto.encodeTerminalSnapshot({
        at: Date.now(),
        terminals: terms,
      })
    );
  }

  /** Stream bytes from a shell execution. */
  private async readExecutionStream(
    termId: number,
    execId: number,
    execution: vscode.TerminalShellExecution
  ) {
    // VS Code’s API streams **text**, we encode to UTF-8 bytes to match the proto.
    const stream = execution.read?.();
    if (!stream) return;

    for await (const chunk of stream) {
      // 1) redact + strip trailing prompt line
      let safe = sanitizeOutputChunk(chunk);

      // 2) On the very first output for this terminal, drop exactly one leading newline
      if (!this.hasEmitted.get(termId)) {
        safe = safe.replace(/^\r?\n/, "");
      }

      // If nothing remains, skip sending
      if (!safe) continue;

      const safeChunk = sanitizeOutputChunk(chunk);
      const u8 = this.enc.encode(safeChunk);
      this.send(
        TerminalProto.encodeTerminalOutput(termId, {
          seq: this.nextSeq(termId),
          at: Date.now(),
          stream: 0, // stdout (best effort)
          data: u8,
          // more?: leave undefined; consumers don’t need it
        })
      );

      this.hasEmitted.set(termId, true);
    }
  }
}
