import * as vscode from "vscode";
import { MainViewProvider } from "./views/MainView";
import { ChatViewProvider } from "./views/ChatView";
import {
  addStateChangeCallback,
  handleAuthTokenChange,
  initSocketConnection,
} from "./stream";
import { syncAuthState } from "./utilities/state";

let outputChannel: vscode.OutputChannel;

export const log = (...args: any[]) => {
  outputChannel?.appendLine("[LOG] " + args.map(String).join(" "));
};

export const error = (...args: any[]) => {
  outputChannel?.appendLine("[ERROR] " + args.map(String).join(" "));
};

export const warn = (...args: any[]) => {
  outputChannel?.appendLine("[WARN] " + args.map(String).join(" "));
};

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Parakeet.tv");
  context.subscriptions.push(outputChannel);

  log("Activating Parakeet.tv extension");
  const handler: vscode.UriHandler = {
    handleUri(uri) {
      if (uri.path === "/auth" && uri.authority === context.extension.id) {
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
          // Initialize socket with new token
          handleAuthTokenChange(context);
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
      log("Parakeet status bar item clicked!");
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

  // Initialize socket connection if we have a valid token
  initSocketConnection(context);
}

// This method is called when your extension is deactivated
export function deactivate() {
  outputChannel?.dispose();
}
