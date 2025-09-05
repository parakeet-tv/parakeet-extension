import * as vscode from "vscode";
import { PartySocket } from "partysocket";
import * as Y from "yjs";

export const startStream = () => {
  console.log("Starting stream");
  const activeEditor = vscode.window.activeTextEditor;

  if (activeEditor) {
    const document = activeEditor.document;
    const documentName = vscode.workspace.asRelativePath(document.uri);
    const documentText = document.getText();

    console.log("Document Name:", documentName);
    console.log("Document Text:", documentText);

    // Initialize Yjs document
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText("monaco");

    // Set the document content in Yjs
    ytext.insert(0, documentText);

    // Connect to partysocket server
    const socket = new PartySocket({
      host: "localhost:8787", // Adjust this to your partyserver URL
      party: "parakeet-server",
      room: "monaco",
      protocol: "ws",
    });

    socket.binaryType = "arraybuffer";

    const HELLO = 0x01;
    const UPDATE = 0x02;

    socket.addEventListener("open", () => {
      console.log("Connected to partysocket server");

      // Send initial state vector
      const sv = Y.encodeStateVector(ydoc);
      const hello = new Uint8Array(1 + sv.byteLength);
      hello[0] = HELLO;
      hello.set(sv, 1);
      socket.send(hello.buffer);

      // Send the full document update
      const update = Y.encodeStateAsUpdate(ydoc);
      const framed = new Uint8Array(1 + update.byteLength);
      framed[0] = UPDATE;
      framed.set(update, 1);
      socket.send(framed.buffer);

      console.log("Sent full document to stream");
    });

    socket.addEventListener("message", async (ev) => {
      if (typeof ev.data === "string") return;
      const ab =
        ev.data instanceof Blob
          ? await ev.data.arrayBuffer()
          : (ev.data as ArrayBuffer);
      const buf = new Uint8Array(ab);
      if (buf.length === 0 || buf[0] !== UPDATE) return;
      Y.applyUpdate(ydoc, buf.subarray(1));
    });

    socket.addEventListener("error", (error) => {
      console.error("Partysocket error:", error);
    });

    socket.addEventListener("close", () => {
      console.log("Partysocket connection closed");
    });

    // Store socket reference for cleanup if needed
    (globalThis as any).parakeetSocket = socket;
  } else {
    console.log("No active text editor found");
  }
};
