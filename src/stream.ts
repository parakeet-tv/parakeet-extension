// stream.ts
import * as vscode from "vscode";
import Partysocket from "partysocket";
import * as Y from "yjs";
import {
  PROTOCOL_VERSION,
  ChannelId,
  ControlType,
  CodeType,
  decodeHeaderOnly,
  unpackMsgpack,
  Control,
  Code,
  Hash,
} from "parakeet-proto";
import { isFileGitIgnored } from "./utilities/utils";

/**
 * Global streaming state for the extension (single active doc).
 */
interface GlobalStreamState {
  socket: Partysocket | null;
  ydoc: Y.Doc | null;
  ytext: Y.Text | null;
  disposables: vscode.Disposable[];
  currentUri: string | null;
  currentIgnored: boolean;
  ignoredCache: Map<string, boolean>;
  isStreaming: boolean;
  currentFileId: number | null;
  /** Queue frames until socket is OPEN (prevents initial-drop). */
  sendQueue: Uint8Array[]; // <-- add
  /** Convenience flag (mirrors socket.readyState === OPEN). */
  isOpen: boolean;
}
const state: GlobalStreamState = {
  socket: null,
  ydoc: null,
  ytext: null,
  disposables: [],
  currentUri: null,
  currentIgnored: false,
  ignoredCache: new Map(),
  isStreaming: false,
  currentFileId: null,
  sendQueue: [],
  isOpen: false,
};

/**
 * Start streaming after the user triggers "startStream".
 * - opens socket
 * - binds VS Code events
 * - sends HELLO and initial snapshot (if file not gitignored)
 */
export async function startStream() {
  if (state.isStreaming) {
    console.log("[parakeet] stream already active");
    return;
  }
  console.log("[parakeet] starting stream…");

  initSocket();

  // Bind global VS Code listeners
  const sub1 = vscode.window.onDidChangeActiveTextEditor(
    () => void handleActiveFileChange()
  );
  const sub2 = vscode.workspace.onDidChangeTextDocument(
    (e) => void onDidChangeTextDocument(e)
  );
  state.disposables.push(sub1, sub2);

  // Kick off with current active file
  await handleActiveFileChange();

  state.isStreaming = true;
  console.log("[parakeet] stream started");
}

/** Stop everything and clean up. */
export function stopAllStreams() {
  console.log("[parakeet] stopping stream…");
  // socket
  try {
    state.socket?.close();
  } catch {}
  state.socket = null;

  // Y.Doc
  if (state.ydoc) {
    try {
      state.ydoc.destroy();
    } catch {}
  }
  state.ydoc = null;
  state.ytext = null;

  // listeners
  state.disposables.forEach((d) => d.dispose());
  state.disposables = [];

  state.currentUri = null;
  state.currentIgnored = false;
  state.isStreaming = false;
  console.log("[parakeet] stream stopped");
}

/* --------------------------- socket + routing --------------------------- */

function initSocket() {
  const host = "localhost:8787"; // TODO: make configurable
  const protocol = "ws";
  const room = "monaco";
  const party = "parakeet-server";

  const ws = new Partysocket({ host, protocol, party, room });
  ws.binaryType = "arraybuffer";
  state.socket = ws;
  state.isOpen = false;

  ws.onopen = () => {
    console.log("[parakeet] ws open");
    state.isOpen = true;
    flushQueue();
    // handshake
    ws.send(
      Control.control.hello({
        v: 1,
        protocol: PROTOCOL_VERSION,
        client: "vscode",
        features: ["delta"],
      })
    );
    // NOTE: as the broadcaster we do not request a snapshot
    flushQueue();
  };

  ws.onmessage = async (ev) => {
    if (typeof ev.data === "string") return;
    const bytes =
      ev.data instanceof Blob
        ? new Uint8Array(await ev.data.arrayBuffer())
        : new Uint8Array(ev.data as ArrayBuffer);
    // Header-only routing; do not process CODE frames (we’re the broadcaster).
    const { header, payloadView } = decodeHeaderOnly(bytes);
    switch (header.channel) {
      case ChannelId.CONTROL:
        if (header.type === ControlType.WELCOME) {
          const msg = unpackMsgpack<{ seq: number }>(payloadView);
          console.log("[parakeet] WELCOME seq=", msg?.seq);
        }
        return;
      case ChannelId.CHAT: {
        // log-only for now
        const chat = unpackMsgpack<any>(payloadView);
        console.log("[parakeet] chat:", chat);
        return;
      }
      case ChannelId.CODE:
        // ignore; server should not echo to sender, but safe to ignore if it does
        return;
      default:
        return;
    }
  };

  ws.onerror = (e) => console.error("[parakeet] ws error", e);
  ws.onclose = (e) => {
    console.log("[parakeet] ws closed", e.code, e.reason);
    state.isOpen = false;
  };

  state.socket = ws;
}

/* --------------------------- file switching ---------------------------- */

/**
 * Handle active editor changes:
 * - if file is gitignored → mark ignored, tear down any current Y.Doc, do nothing
 * - else → create Y.Doc, seed with full content, send CODE.SNAPSHOT
 */
async function handleActiveFileChange() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    console.log("[parakeet] no active editor");
    state.currentUri = null;
    state.currentIgnored = false;
    teardownDoc();
    return;
  }

  const uri = editor.document.uri;
  const uriStr = uri.toString();
  if (uriStr === state.currentUri) return; // no-op

  const relPath = vscode.workspace.asRelativePath(uri);
  const fileId = Hash.fileIdFromPath(relPath);
  state.currentFileId = fileId;

  // announce active file to viewers
  sendFrame(Control.control.fileInfo({ fileId, path: relPath }));

  // Check gitignore status (cached)
  let ignored = state.ignoredCache.get(uriStr);
  if (ignored === undefined) {
    ignored = await isFileGitIgnored(uri);
    state.ignoredCache.set(uriStr, ignored);
  }

  state.currentUri = uriStr;
  state.currentIgnored = ignored;

  if (ignored) {
    console.log(
      "[parakeet] file is gitignored; not streaming:",
      vscode.workspace.asRelativePath(uri)
    );
    teardownDoc();
    return;
  }

  // Create a fresh Y.Doc for this file and seed content
  resetDoc();
  const text = editor.document.getText();
  state.ytext!.insert(0, text);

  // Send full snapshot
  sendFrame(Code.encodeSnapshot(state.ydoc!, fileId));
  console.log(
    "[parakeet] sent SNAPSHOT for",
    vscode.workspace.asRelativePath(uri)
  );
}

/* ---------------------------- text changes ----------------------------- */

/**
 * Convert VS Code edits into Y.Text ops so Yjs emits updates (which we forward).
 * We *don’t* send these edits directly; we let Yjs produce the delta and
 * stream it via Code.encodeDelta in onYUpdate().
 */
function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
  if (!state.isStreaming || state.currentIgnored) return;
  if (!state.ydoc || !state.ytext) return;
  if (event.document.uri.toString() !== state.currentUri) return;

  const ytext = state.ytext;
  // Apply changes in the order VS Code gives (already sorted)
  for (const change of event.contentChanges) {
    const start = event.document.offsetAt(change.range.start);
    if (change.rangeLength > 0) {
      ytext.delete(start, change.rangeLength);
    }
    if (change.text.length > 0) {
      ytext.insert(start, change.text);
    }
  }
}

/* ------------------------------ Y wiring ------------------------------- */

function resetDoc() {
  teardownDoc();
  state.ydoc = new Y.Doc();
  state.ytext = state.ydoc.getText("monaco");

  // Send Yjs deltas generated by local edits
  const onYUpdate = (update: Uint8Array) => {
    // Only forward if we’re not on an ignored file
    if (state.currentIgnored) return;
    if (state.currentFileId == null) return;
    sendFrame(Code.encodeDelta(update, state.currentFileId!));
  };
  state.ydoc.on("update", onYUpdate);

  // Track for teardown
  state.disposables.push(
    new vscode.Disposable(() => {
      state.ydoc?.off("update", onYUpdate);
    })
  );
}

function teardownDoc() {
  if (state.ydoc) {
    try {
      state.ydoc.destroy();
    } catch {}
  }
  state.ydoc = null;
  state.ytext = null;
}

/* ---------------------------- send helpers ----------------------------- */

function sendFrame(bytes: Uint8Array) {
  const ws = state.socket;
  if (!ws || !state.isOpen) {
    // queue and try to flush later
    state.sendQueue.push(bytes);
    return;
  }
  ws.send(bytes);
}

function flushQueue() {
  if (!state.socket || !state.isOpen) return;
  // FIFO flush
  for (const frame of state.sendQueue) state.socket.send(frame);
  if (state.sendQueue.length) {
    console.log(`[parakeet] flushed ${state.sendQueue.length} queued frame(s)`);
  }
  state.sendQueue = [];
}
