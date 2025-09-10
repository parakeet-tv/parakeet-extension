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
  Chat,
  Hash,
  type CtrlUpdateMetadata,
} from "parakeet-proto";
import { isFileGitIgnored, isFileTooLarge } from "./utilities/utils";
import type { SettingsState } from "./utilities/state";

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
  ignoredCache: Map<string, { gitIgnored: boolean; tooLarge: boolean }>;
  isStreaming: boolean;
  currentFileId: number | null;
  /** Queue frames until socket is OPEN (prevents initial-drop). */
  sendQueue: Uint8Array[]; // <-- add
  /** Convenience flag (mirrors socket.readyState === OPEN). */
  isOpen: boolean;
  /** Debounce timer for highlight recomputation. */
  highlightTimer: NodeJS.Timeout | null;
  /** Callbacks to notify webviews of state changes */
  onStateChangeCallbacks: ((state: StreamingState) => void)[];
  /** Callbacks to notify webviews of chat messages */
  chatCallbacks: ((message: any) => void)[];
  viewerCount: number;
  /** Current auth token for socket connection */
  currentToken: string | null;
  /** Extension context reference for auth checking */
  context: vscode.ExtensionContext | null;
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
  highlightTimer: null,
  onStateChangeCallbacks: [],
  chatCallbacks: [],
  viewerCount: 0,
  currentToken: null,
  context: null,
};

export type StreamingState = {
  isStreaming: boolean;
  isConnected: boolean;
  viewerCount: number;
};

/**
 * Add callback to notify webviews of state changes
 */
export function addStateChangeCallback(
  callback: (state: StreamingState) => void
) {
  state.onStateChangeCallbacks.push(callback);
}

/**
 * Set callback to notify webview of state changes (legacy support)
 */
export function setStateChangeCallback(
  callback: (state: StreamingState) => void
) {
  // Clear existing callbacks and add the new one for backward compatibility
  state.onStateChangeCallbacks = [callback];
}

/**
 * Get current streaming state
 */
export function getStreamingState(): StreamingState {
  return {
    isStreaming: state.isStreaming,
    isConnected: state.isOpen,
    viewerCount: state.viewerCount,
  };
}

/**
 * Add callback to receive chat messages
 */
export function addChatCallback(callback: (message: any) => void) {
  state.chatCallbacks.push(callback);
}

/**
 * Remove chat callback
 */
export function removeChatCallback(callback: (message: any) => void) {
  const index = state.chatCallbacks.indexOf(callback);
  if (index > -1) {
    state.chatCallbacks.splice(index, 1);
  }
}

/**
 * Send a chat message through the stream
 */
export function sendChatMessage(message: any) {
  if (!state.socket || !state.isOpen) {
    console.warn("Cannot send chat message: socket not connected");
    return;
  }

  try {
    const chatFrame = Chat.chat.user(message);
    state.socket.send(chatFrame);
  } catch (error) {
    console.error("Error sending chat message:", error);
  }
}

/**
 * Notify webviews of state changes
 */
function notifyStateChange() {
  const currentState = getStreamingState();
  state.onStateChangeCallbacks.forEach((callback) => callback(currentState));
}

/**
 * Initialize socket connection when auth token is available.
 * This should be called whenever we have a valid token.
 */
export async function initSocketConnection(context: vscode.ExtensionContext) {
  state.context = context;
  const token = await context.secrets.get("parakeet-token");

  if (!token) {
    console.log("[parakeet] no auth token available");
    return;
  }

  // If we already have a socket with the same token, no need to reconnect
  if (state.socket && state.currentToken === token) {
    console.log("[parakeet] socket already connected with current token");
    return;
  }

  // Clean up existing socket if token changed
  if (state.socket && state.currentToken !== token) {
    console.log("[parakeet] token changed, reconnecting socket");
    cleanupSocket();
  }

  state.currentToken = token;
  await initSocket(context);
}

/**
 * Start streaming after the user triggers "startStream".
 * - requires socket to be already connected
 * - binds VS Code events
 * - sends initial snapshot (if file not gitignored)
 */
export async function startStream(context?: vscode.ExtensionContext) {
  if (state.isStreaming) {
    console.log("[parakeet] stream already active");
    return;
  }
  console.log("[parakeet] starting stream…");

  // Ensure socket is connected first
  if (context) {
    await initSocketConnection(context);
  }

  if (!state.socket || !state.isOpen) {
    console.error(
      "[parakeet] cannot start streaming without socket connection"
    );
    return;
  }

  // Bind global VS Code listeners
  const sub1 = vscode.window.onDidChangeActiveTextEditor(
    () => void handleActiveFileChange()
  );
  const sub2 = vscode.workspace.onDidChangeTextDocument(
    (e) => void onDidChangeTextDocument(e)
  );
  const sub3 = vscode.window.onDidChangeTextEditorSelection(
    (e) => void onDidChangeTextEditorSelection(e)
  );
  state.disposables.push(sub1, sub2, sub3);

  sendFrame(Control.control.goLive());
  state.isStreaming = true;

  // Sync metadata to reflect the new streaming state
  syncMetadata();

  // Kick off with current active file
  await handleActiveFileChange(true);

  notifyStateChange();

  console.log("[parakeet] stream started");
}

/** Stop streaming but keep socket connected. */
export function stopStream() {
  console.log("[parakeet] stopping stream…");

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
  notifyStateChange();
  console.log("[parakeet] stream stopped");

  syncMetadata();
}

/** Stop everything and clean up socket too. */
export function stopAllStreams() {
  console.log("[parakeet] stopping all streams and socket…");
  stopStream();
  cleanupSocket();
}

/** Clean up socket connection */
function cleanupSocket() {
  try {
    state.socket?.close();
  } catch {}
  state.socket = null;
  state.currentToken = null;
  state.isOpen = false;
  state.sendQueue = [];
  state.viewerCount = 0;
  notifyStateChange();
}

/**
 * Handle auth token changes - should be called when new token is detected
 */
export async function handleAuthTokenChange(context: vscode.ExtensionContext) {
  console.log("[parakeet] auth token changed, updating socket connection");
  await initSocketConnection(context);
}

/* --------------------------- socket + routing --------------------------- */

async function initSocket(context?: vscode.ExtensionContext) {
  const host = "localhost:8787"; // TODO: make configurable
  const protocol = "ws";
  const room = "benank";
  const party = "parakeet-server";
  const prefix = "live";

  let query: { token?: string } = {};
  if (context) {
    const token = await context.secrets.get("parakeet-token");
    if (token) {
      query.token = token;
    }
  }

  const ws = new Partysocket({ host, protocol, party, room, query, prefix });
  ws.binaryType = "arraybuffer";
  state.socket = ws;
  state.isOpen = false;

  ws.onopen = () => {
    console.log("[parakeet] ws open");
    state.isOpen = true;
    notifyStateChange();

    ws.send(
      Control.control.hello({
        v: 1,
        protocol: PROTOCOL_VERSION,
        client: "vscode",
        features: ["delta"],
      })
    );

    ws.send(Control.control.broadcaster());

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
        } else if (header.type === ControlType.VIEWER_COUNT) {
          const msg = unpackMsgpack<{ count: number }>(payloadView);
          console.log("[parakeet] VIEWER_COUNT=", msg?.count);
          state.viewerCount = msg?.count ?? 0;
          notifyStateChange();
        } else if (header.type === ControlType.UPDATE_METADATA) {
          const msg = unpackMsgpack<CtrlUpdateMetadata>(payloadView);
          if (state.isStreaming && !msg.isLive) {
            // if we were streaming and the server is no longer streaming, stop the stream
            stopStream();
          } else if (!state.isStreaming && msg.isLive) {
            // if we were not streaming and the server is streaming, sync the metadata to ensure the metadata is up to date
            syncMetadata();
          }
        }
        return;
      case ChannelId.CHAT: {
        const chat = unpackMsgpack<any>(payloadView);
        console.log("[parakeet] chat:", chat);

        // Forward chat message to all registered chat callbacks
        state.chatCallbacks.forEach((callback) => {
          try {
            callback(chat);
          } catch (error) {
            console.error("Error forwarding chat message to callback:", error);
          }
        });
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
    notifyStateChange();
  };

  state.socket = ws;
}

/* --------------------------- file switching ---------------------------- */

/**
 * Handle active editor changes:
 * - if file is gitignored → mark ignored, tear down any current Y.Doc, do nothing
 * - else → create Y.Doc, seed with full content, send CODE.SNAPSHOT
 */
async function handleActiveFileChange(forceUpdate = false) {
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
  if (uriStr === state.currentUri && !forceUpdate) return; // no-op

  const relPath = vscode.workspace.asRelativePath(uri);
  const fileId = Hash.fileIdFromPath(relPath);
  state.currentFileId = fileId;

  // announce active file to viewers
  sendFrame(Control.control.fileInfo({ fileId, path: relPath }));

  // Check gitignore status and file size (cached)
  let ignoreInfo = state.ignoredCache.get(uriStr);
  if (ignoreInfo === undefined) {
    const [gitIgnored, tooLarge] = await Promise.all([
      isFileGitIgnored(uri),
      isFileTooLarge(uri),
    ]);
    ignoreInfo = { gitIgnored, tooLarge };
    state.ignoredCache.set(uriStr, ignoreInfo);
  }

  const ignored = ignoreInfo.gitIgnored || ignoreInfo.tooLarge;
  state.currentUri = uriStr;
  state.currentIgnored = ignored;

  if (ignored) {
    const reason = ignoreInfo.gitIgnored
      ? "file is gitignored"
      : "file is too large (>0.8 MB)";
    console.log(
      `[parakeet] ${reason}; not streaming:`,
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

  // Immediately sync pointer & highlights for the new active file
  sendCursorForEditor(editor);
  sendHighlightsForEditor(editor);
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

  // Use pre-change absolute offsets provided by VS Code.
  const changes = event.contentChanges.map((ch) => ({
    start: ch.rangeOffset, // absolute offset (pre-change)
    len: ch.rangeLength, // delete length (pre-change)
    text: ch.text, // replacement text
  }));

  // Apply from highest offset -> lowest to avoid index drift.
  changes.sort((a, b) => b.start - a.start);

  state.ydoc.transact(() => {
    for (const { start, len, text } of changes) {
      if (len > 0) ytext.delete(start, len); // delete first
      if (text && text.length) ytext.insert(start, text); // then insert at same start
    }
  }, "ext"); // optional origin tag
}

/* ------------------------- cursor / highlights ------------------------- */

function onDidChangeTextEditorSelection(
  event: vscode.TextEditorSelectionChangeEvent
) {
  if (!state.isStreaming || state.currentIgnored) return;
  const editor = event.textEditor;
  if (editor.document.uri.toString() !== state.currentUri) return;
  sendCursorForEditor(editor);
  // debounce highlight recomputation to avoid floods as the caret moves
  if (state.highlightTimer) clearTimeout(state.highlightTimer);
  state.highlightTimer = setTimeout(() => {
    sendHighlightsForEditor(editor);
  }, 150);
}

function sendCursorForEditor(editor: vscode.TextEditor) {
  if (state.currentFileId == null) return;
  const cursors = editor.selections.map((sel) => ({
    anchor: { line: sel.anchor.line, ch: sel.anchor.character },
    head: { line: sel.active.line, ch: sel.active.character },
  }));
  sendFrame(Control.control.cursor({ cursors }, state.currentFileId!));
}

async function sendHighlightsForEditor(editor: vscode.TextEditor) {
  try {
    if (state.currentFileId == null) return;
    // Query VS Code's language features for "document highlights" at the active position
    const pos = editor.selection.active;
    const res = (await vscode.commands.executeCommand(
      "vscode.executeDocumentHighlights",
      editor.document.uri,
      pos
    )) as vscode.DocumentHighlight[] | undefined;

    const ranges =
      res?.map((h) => ({
        sl: h.range.start.line,
        sc: h.range.start.character,
        el: h.range.end.line,
        ec: h.range.end.character,
        kind: typeof h.kind === "number" ? h.kind : undefined, // 0,1,2 (text/read/write)
      })) ?? [];

    sendFrame(Control.control.highlights({ ranges }, state.currentFileId!));
  } catch (err) {
    // Non-fatal; some languages won't provide highlights
    // console.debug("[parakeet] highlights unavailable:", err);
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

  if (state.highlightTimer) {
    clearTimeout(state.highlightTimer);
    state.highlightTimer = null;
  }
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

// Store current settings for metadata sync
let currentSettings: SettingsState | null = null;

/**
 * Sync metadata to server using current settings and streaming state
 */
function syncMetadata() {
  try {
    if (!currentSettings) {
      console.warn("[parakeet] cannot sync metadata: no settings");
      return;
    }
    // Combine userTags and autoTags for the metadata
    const allTags = [
      ...(currentSettings.userTags || []),
      ...(currentSettings.autoTags || []),
    ];

    // Create metadata frame using the CtrlUpdateMetadata structure
    const metadataFrame = Control.control.updateMetadata({
      title: currentSettings.streamTitle,
      description: currentSettings.streamDescription,
      tags: allTags,
      isLive: state.isStreaming,
      startTime: Date.now(), // Current timestamp
    });

    sendFrame(metadataFrame);
  } catch (error) {
    console.error("[parakeet] error syncing metadata:", error);
  }
}

/**
 * Called when the user saves settings in the webview
 * Syncs settings as metadata to the server using Control.control.updateMetadata
 * @param settings
 */
export function saveSettings(settings: SettingsState) {
  console.log("[parakeet] saving settings", settings);

  // Store settings for future metadata syncs
  currentSettings = settings;

  if (!state.socket || !state.isOpen) {
    console.warn("[parakeet] cannot sync settings: socket not connected");
    return;
  }

  // Sync metadata with the new settings
  syncMetadata();
}
