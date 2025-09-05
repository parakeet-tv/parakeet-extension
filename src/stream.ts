import * as vscode from "vscode";
import { PartySocket } from "partysocket";
import * as Y from "yjs";

/**
 * Global Streaming Architecture
 * 
 * This module implements a global streaming system that:
 * 1. Maintains a single WebSocket connection to the server
 * 2. Tracks the currently active file in VS Code
 * 3. When file switches occur:
 *    - Sends the entire new file content to the server (FILE_SWITCH message)
 *    - Creates a new Yjs document for the file
 * 4. For subsequent edits to the same file:
 *    - Sends only delta updates (UPDATE messages)
 * 
 * Message Protocol:
 * - HELLO (0x01): Initial handshake
 * - UPDATE (0x02): Delta updates using Yjs
 * - FILE_SWITCH (0x03): Full file content on file change
 *   Format: [FILE_SWITCH, fileName_length(4 bytes), fileName, content]
 */

/**
 * Interface to store the global stream connection state
 */
interface GlobalStreamState {
  socket: PartySocket | null;
  ydoc: Y.Doc | null;
  disposables: vscode.Disposable[];
  currentDocumentUri: string | null;
  isStreaming: boolean;
}

// Global streaming state
const globalStream: GlobalStreamState = {
  socket: null,
  ydoc: null,
  disposables: [],
  currentDocumentUri: null,
  isStreaming: false
};

// Protocol constants
const HELLO = 0x01;
const UPDATE = 0x02;
const FILE_SWITCH = 0x03; // New message type for file switches

/**
 * Starts global collaborative streaming
 * This should be called once to enable streaming for all files
 */
export const startStream = () => {
  console.log("Starting global stream");
  
  if (globalStream.isStreaming) {
    console.log("Stream already active");
    return;
  }

  // Initialize the global connection
  initializeGlobalConnection();
  
  // Set up global event listeners
  setupGlobalListeners();
  
  // Handle the currently active file
  handleActiveFileChange();
  
  globalStream.isStreaming = true;
  console.log("Global stream started");
};

/**
 * Initializes the global socket connection
 */
const initializeGlobalConnection = () => {
  // Connect to partysocket server
  globalStream.socket = new PartySocket({
    host: "localhost:8787",
    party: "parakeet-server", 
    room: "monaco",
    protocol: "ws",
  });

  globalStream.socket.binaryType = "arraybuffer";

  globalStream.socket.addEventListener("open", () => {
    console.log("Connected to partysocket server");
  });

  globalStream.socket.addEventListener("message", async (ev) => {
    if (typeof ev.data === "string") return;
    const ab = ev.data instanceof Blob 
      ? await ev.data.arrayBuffer()
      : (ev.data as ArrayBuffer);
    const buf = new Uint8Array(ab);
    if (buf.length === 0 || buf[0] !== UPDATE) return;
    
    // Apply updates to current Yjs document if it exists
    if (globalStream.ydoc) {
      Y.applyUpdate(globalStream.ydoc, buf.subarray(1));
    }
  });

  globalStream.socket.addEventListener("error", (error) => {
    console.error("Partysocket error:", error);
  });

  globalStream.socket.addEventListener("close", () => {
    console.log("Partysocket connection closed");
    resetGlobalStream();
  });
};

/**
 * Sets up global event listeners for file changes and editor switches
 */
const setupGlobalListeners = () => {
  // Listen for active editor changes (file switches)
  const activeEditorListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!globalStream.isStreaming) return;
    handleActiveFileChange();
  });

  // Listen for document changes in any file
  const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    if (!globalStream.isStreaming) return;
    
    const documentUri = event.document.uri.toString();
    
    // Only handle changes for the currently active streaming document
    if (documentUri !== globalStream.currentDocumentUri) return;
    
    handleDocumentChanges(event);
  });

  globalStream.disposables.push(activeEditorListener, documentChangeListener);
};

/**
 * Handles when the active file changes - sends full file content
 */
const handleActiveFileChange = () => {
  const activeEditor = vscode.window.activeTextEditor;
  
  if (!activeEditor) {
    console.log("No active text editor found");
    globalStream.currentDocumentUri = null;
    return;
  }

  const document = activeEditor.document;
  const documentUri = document.uri.toString();
  
  // If this is the same document, no need to switch
  if (documentUri === globalStream.currentDocumentUri) {
    return;
  }

  const documentName = vscode.workspace.asRelativePath(document.uri);
  const documentText = document.getText();
  
  console.log("Switching to document:", documentName);
  console.log("Document URI:", documentUri);
  
  // Update current document
  globalStream.currentDocumentUri = documentUri;
  
  // Create new Yjs document for this file
  if (globalStream.ydoc) {
    globalStream.ydoc.destroy();
  }
  
  globalStream.ydoc = new Y.Doc();
  const ytext = globalStream.ydoc.getText("monaco");
  
  // Set the document content in Yjs
  ytext.insert(0, documentText);
  
  // Set up update handler for this document
  setupYjsUpdateHandler();
  
  // Send file switch message with full content
  sendFileSwitch(documentName, documentText);
};

/**
 * Sets up the Yjs update handler for the current document
 */
const setupYjsUpdateHandler = () => {
  if (!globalStream.ydoc) return;
  
  const updateHandler = (update: Uint8Array, origin: any) => {
    console.log("Yjs update handler called", { 
      updateLength: update.byteLength, 
      origin: origin
    });
    
    // Send delta updates to server
    const framed = new Uint8Array(1 + update.byteLength);
    framed[0] = UPDATE;
    framed.set(update, 1);
    
    if (globalStream.socket && globalStream.socket.readyState === WebSocket.OPEN) {
      globalStream.socket.send(framed.buffer);
      console.log("Sent delta update to stream - size:", framed.byteLength);
    } else {
      console.log("Socket not ready - state:", globalStream.socket?.readyState);
    }
  };

  globalStream.ydoc.on("update", updateHandler);
};

/**
 * Sends a file switch message with full file content
 */
const sendFileSwitch = (fileName: string, content: string) => {
  if (!globalStream.socket || globalStream.socket.readyState !== WebSocket.OPEN) {
    console.log("Socket not ready for file switch");
    return;
  }

  // Create file switch message: [FILE_SWITCH, fileName_length, fileName, content]
  const fileNameBytes = new TextEncoder().encode(fileName);
  const contentBytes = new TextEncoder().encode(content);
  
  const message = new Uint8Array(
    1 + // FILE_SWITCH byte
    4 + // fileName length (4 bytes)
    fileNameBytes.byteLength + 
    contentBytes.byteLength
  );
  
  let offset = 0;
  message[offset++] = FILE_SWITCH;
  
  // Write fileName length (4 bytes, little endian)
  const fileNameLength = fileNameBytes.byteLength;
  message[offset++] = fileNameLength & 0xFF;
  message[offset++] = (fileNameLength >> 8) & 0xFF;
  message[offset++] = (fileNameLength >> 16) & 0xFF;
  message[offset++] = (fileNameLength >> 24) & 0xFF;
  
  // Write fileName
  message.set(fileNameBytes, offset);
  offset += fileNameBytes.byteLength;
  
  // Write content
  message.set(contentBytes, offset);
  
  globalStream.socket.send(message.buffer);
  console.log(`Sent file switch to stream - file: ${fileName}, content size: ${contentBytes.byteLength}`);
};

/**
 * Handles document changes and converts them to Yjs operations
 */
const handleDocumentChanges = (event: vscode.TextDocumentChangeEvent) => {
  if (!globalStream.ydoc) return;
  
  const ytext = globalStream.ydoc.getText("monaco");
  
  console.log("Document change detected for streaming document:", globalStream.currentDocumentUri);
  console.log("Number of changes:", event.contentChanges.length);

  // Convert VS Code changes to Yjs operations
  event.contentChanges.forEach((change, index) => {
    console.log(`Processing change ${index}:`, {
      rangeStart: change.range.start,
      rangeEnd: change.range.end,
      rangeLength: change.rangeLength,
      text: change.text
    });

    const startOffset = event.document.offsetAt(change.range.start);
    console.log(`Change ${index} startOffset:`, startOffset);
    
    // Handle deletions first
    if (change.rangeLength > 0) {
      console.log(`Deleting ${change.rangeLength} characters at offset ${startOffset}`);
      ytext.delete(startOffset, change.rangeLength);
    }
    
    // Handle insertions
    if (change.text.length > 0) {
      console.log(`Inserting "${change.text}" at offset ${startOffset}`);
      ytext.insert(startOffset, change.text);
    }
  });

  console.log("Yjs document content after changes:", ytext.toString());
};

/**
 * Resets the global stream state
 */
const resetGlobalStream = () => {
  // Clean up socket
  if (globalStream.socket && globalStream.socket.readyState === WebSocket.OPEN) {
    globalStream.socket.close();
  }
  globalStream.socket = null;

  // Clean up disposables
  globalStream.disposables.forEach(disposable => disposable.dispose());
  globalStream.disposables = [];

  // Clean up Yjs document
  if (globalStream.ydoc) {
    globalStream.ydoc.destroy();
    globalStream.ydoc = null;
  }

  globalStream.currentDocumentUri = null;
  globalStream.isStreaming = false;
  
  console.log("Global stream reset");
};

/**
 * Stops all streaming
 */
export const stopAllStreams = () => {
  resetGlobalStream();
  console.log("All streams stopped");
};
