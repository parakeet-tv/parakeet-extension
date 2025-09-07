import * as vscode from "vscode";
import { MainViewProvider } from "./views/MainView";
import { ChatViewProvider } from "./views/ChatView";
import { addStateChangeCallback } from "./stream";
import { syncAuthState } from "./utilities/state";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const handler: vscode.UriHandler = {
    handleUri(uri) {
      if (uri.path === "/auth" && uri.scheme === "vscode" && uri.authority === "parakeet.tv.parakeet-tv") {
        const params = new URLSearchParams(uri.query);
        const token = params.get("token");
        const userId = params.get("userId");
        const username = params.get("username");
        const imageUrl = params.get("imageUrl");

        if (token && userId && username && imageUrl) {
          context.secrets.store("parakeet-token", token);
          context.secrets.store("parakeet-userId", userId);
          context.secrets.store("parakeet-username", username);
          context.secrets.store("parakeet-imageUrl", imageUrl);
          
          // Sync auth state after storing new credentials
          syncAuthState(context);
        }
      }
    },
  };

  context.subscriptions.push(vscode.window.registerUriHandler(handler));

  const provider = new MainViewProvider(
    context.extensionUri,
    context.extensionMode,
    context
  );
  const chatProvider = new ChatViewProvider(
    context.extensionUri,
    context.extensionMode,
    context
  );

  console.log(
    `workspace: ${vscode.workspace.workspaceFolders
      ?.map((r) => r.name)
      .join(" ")}`
  );

  // Open files (multiple in split views)
  console.log(
    `files: ${vscode.window.visibleTextEditors
      .map((r) => r.document.fileName)
      .join(" ")}`
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MainViewProvider.viewType,
      provider
    )
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatProvider
    )
  );

  // Set up callback to auto-open chat panel when streaming starts
  addStateChangeCallback(({ isStreaming, isConnected }) => {
    if (isStreaming && isConnected) {
      // Auto-open the chat panel when streaming starts
      chatProvider.reveal();
    }
  });

  // Register the status bar click command
  const statusBarCommand = vscode.commands.registerCommand(
    "parakeet-tv.statusBarClick",
    () => {
      // Log to console when status bar item is clicked
      console.log("Parakeet status bar item clicked!");
    }
  );

  // Create the status bar item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1
  );
  statusBarItem.command = "parakeet-tv.statusBarClick";
  statusBarItem.text = "Parakeet";
  statusBarItem.tooltip = "Click to interact with Parakeet";
  statusBarItem.show();

  context.subscriptions.push(statusBarCommand);
  context.subscriptions.push(statusBarItem);

  // Initial auth state sync on activation
  syncAuthState(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}
