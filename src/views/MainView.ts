import * as vscode from "vscode";
import { generateTagsFromRepo } from "../utilities/utils";
import { processHtmlForWebview } from "../utilities/htmlUtils";
import {
  startStream,
  stopStream,
  stopAllStreams,
  setStateChangeCallback,
  getStreamingState,
  saveSettings
} from "../stream";
import { 
  registerWebviewForAuthUpdates, 
  unregisterWebviewForAuthUpdates, 
  syncAuthState, 
  logOut,
  type SettingsState
} from "../utilities/state";

export class MainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "parakeet.mainView";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _extensionMode: vscode.ExtensionMode,
    private readonly _context: vscode.ExtensionContext
  ) {}

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

    // Set up streaming state callback
    setStateChangeCallback(({ isStreaming, isConnected, viewerCount }) => {
      webviewView.webview.postMessage({
        command: "streamingStateChanged",
        isStreaming,
        isConnected,
        viewerCount,
      });

      // Seems like there is an internal rate limit on the badge
      // TOOD: come back to this
      // if (isStreaming && isConnected) {
      //   webviewView.badge = {
      //     tooltip: `LIVE with ${viewerCount} viewer${
      //       viewerCount === 1 ? "" : "s"
      //     }`,
      //     value: viewerCount,
      //   };
      // } else {
      //   webviewView.badge = undefined;
      // }
    });

    webviewView.webview.onDidReceiveMessage(async (message: any) => {
      const command = message.command;
      const text = message.text;
      console.log("Received message in main view:", message);

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
          stopStream();
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
        case "logOut":
          logOut(this._context);
          return;
        case "saveSettings":
          saveSettings(JSON.parse(message.settings) as SettingsState);
          return;
      }
    });

    // Clean up webview registration when disposed
    webviewView.onDidDispose(() => {
      unregisterWebviewForAuthUpdates(webviewView.webview);
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
      isChatMode: false,
      extensionMode: this._extensionMode,
    });
  }
}
