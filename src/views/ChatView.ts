import * as vscode from "vscode";
import { generateTagsFromRepo } from "../utilities/utils";
import { processHtmlForWebview } from "../utilities/htmlUtils";
import {
  startStream,
  stopAllStreams,
  addStateChangeCallback,
  getStreamingState,
  addChatCallback,
  removeChatCallback,
  sendChatMessage,
} from "../stream";
import { 
  registerWebviewForAuthUpdates, 
  unregisterWebviewForAuthUpdates, 
  syncAuthState 
} from "../utilities/state";

/**
 * ChatViewProvider manages the chat webview in the bottom panel
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "parakeet.chatView";

  private _view?: vscode.WebviewView;
  private _chatCallback?: (message: any) => void;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _extensionMode: vscode.ExtensionMode,
    private readonly _context: vscode.ExtensionContext
  ) {}

  /**
   * Reveal the chat view panel
   */
  public reveal() {
    if (this._view) {
      this._view.show?.(true);
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, "webview-ui", "build"),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Register webview for auth updates
    registerWebviewForAuthUpdates(webviewView.webview);

    // Initial auth state sync
    syncAuthState(this._context);

    // Set up chat message callback
    this._chatCallback = (message: any) => {
      webviewView.webview.postMessage({
        command: "chatMessage",
        message: message,
      });
    };
    addChatCallback(this._chatCallback);

    // Set up streaming state callback
    addStateChangeCallback(({ isStreaming, isConnected, viewerCount }) => {
      webviewView.webview.postMessage({
        command: "streamingStateChanged",
        isStreaming,
        isConnected,
        viewerCount,
      });

      if (isStreaming && isConnected) {
        webviewView.badge = {
          tooltip: `LIVE with ${viewerCount} viewer${
            viewerCount === 1 ? "" : "s"
          }`,
          value: viewerCount,
        };
      } else {
        webviewView.badge = undefined;
      }
    });

    webviewView.webview.onDidReceiveMessage(async (message: any) => {
      const command = message.command;
      const text = message.text;
      console.log("Received message in chat view:", message);

      switch (command) {
        case "hello":
          // Code that should run in response to the hello message command
          vscode.window.showInformationMessage(text);
          return;
        case "generateTags":
          this._generateTagsForWebview(webviewView.webview);
          return;
        case "startStream":
          startStream(this._context);
          return;
        case "stopStream":
          stopAllStreams();
          return;
        case "getStreamingState":
          const currentState = getStreamingState();
          webviewView.webview.postMessage({
            command: "streamingStateChanged",
            isStreaming: currentState.isStreaming,
            isConnected: currentState.isConnected,
          });
          return;
        case "getAuthState":
          syncAuthState(this._context);
          return;
        case "sendChatMessage":
          if (message.message) {
            sendChatMessage(message.message);
          }
          return;
      }
    });

    // Clean up webview registration when disposed
    webviewView.onDidDispose(() => {
      unregisterWebviewForAuthUpdates(webviewView.webview);
      if (this._chatCallback) {
        removeChatCallback(this._chatCallback);
      }
    });
  }

  private async _generateTagsForWebview(
    webview: vscode.Webview
  ): Promise<void> {
    try {
      const tags = await generateTagsFromRepo();
      webview.postMessage({
        command: "tagsGenerated",
        tags: tags,
      });
    } catch (error) {
      console.error("Error generating tags:", error);
      webview.postMessage({
        command: "tagsGenerated",
        tags: [],
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return processHtmlForWebview(webview, this._extensionUri, {
      isChatMode: true,
      extensionMode: this._extensionMode,
    });
  }
}
