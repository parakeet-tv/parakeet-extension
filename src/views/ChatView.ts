import * as vscode from "vscode";
import { getNonce, getUri, generateTagsFromRepo } from "../utilities/utils";
import { readFileSync } from "fs";
import {
  startStream,
  stopAllStreams,
  addStateChangeCallback,
  getStreamingState,
} from "../stream";

/**
 * ChatViewProvider manages the chat webview in the bottom panel
 */
export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "parakeet.chatView";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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
          startStream();
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
    const buildUri = vscode.Uri.joinPath(
      this._extensionUri,
      "webview-ui",
      "build"
    );
    const indexUri = vscode.Uri.joinPath(buildUri, "index.html");

    let html = readFileSync(indexUri.fsPath, "utf8");
    const nonce = getNonce();

    const toWebviewUri = (p: string) => {
      const clean = p.replace(/^\//, "");
      return webview
        .asWebviewUri(vscode.Uri.joinPath(buildUri, ...clean.split("/")))
        .toString();
    };

    // 1) Inject CSP + fix routing BEFORE SvelteKit boots
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${webview.cspSource} data: https://*.parakeet.tv https://parakeet.tv;
    font-src ${webview.cspSource} https://*.parakeet.tv https://parakeet.tv;
    style-src ${webview.cspSource} 'unsafe-inline' https://*.parakeet.tv https://parakeet.tv;
    script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval' https://*.parakeet.tv https://parakeet.tv;
    script-src-elem 'nonce-${nonce}' ${webview.cspSource} https://*.parakeet.tv https://parakeet.tv;
    connect-src ${webview.cspSource} https: https://*.parakeet.tv https://parakeet.tv;
    worker-src ${webview.cspSource};
    form-action 'none';
  ">
  <base href="./">`
    );

    // 2) Rewrite asset URLs in attributes (src/href), including rel="modulepreload"
    const ATTR_URL =
      /(src|href)=["'](?!https?:|data:|vscode-webview:)([^"']+)["']/g;
    html = html.replace(ATTR_URL, (m, attr, url) => {
      if (
        /^(?:\.\/|\/|_app\/|assets\/|favicon|manifest\.webmanifest)/.test(url)
      ) {
        return `${attr}="${toWebviewUri(url)}"`;
      }
      return m;
    });

    // 3) Rewrite dynamic import("./_app/...") inside inline scripts
    //    Your provided HTML matches this pattern exactly.
    html = html.replace(
      /import\(\s*["'](\.\/_app\/[^"']+)["']\s*\)/g,
      (_m, rel) => `import("${toWebviewUri(rel)}")`
    );

    // 4) Nonce every <script> so CSP passes (leave existing nonce if present)
    html = html.replace(
      /<script(?![^>]*\bnonce=)([^>]*)>/g,
      `<script nonce="${nonce}"$1>`
    );

    // 5) Override SvelteKit base path dynamically (works with any build-specific variable name)
    html = html.replace(
      /(__sveltekit_\w+)\s*=\s*\{\s*base:\s*new URL\("\.",\s*location\)\.pathname\.slice\(0,\s*-1\)\s*\};/g,
      (match, varName) => `${varName} = { base: "" };`
    );

    // 6) Add chat mode indicator for SvelteKit app
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>
<script nonce="${nonce}">
  // Set chat mode for SvelteKit app before it loads
  window.__PARAKEET_CHAT_MODE__ = true;
</script>`
    );

    // 7) Expose VS Code API
    html = html.replace(
      /<\/body>\s*<\/html>\s*$/i,
      `<script nonce="${nonce}">window.vscode = acquireVsCodeApi();</script></body></html>`
    );

    return html;
  }
}
