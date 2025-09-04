import * as vscode from "vscode";
import { getNonce, getUri } from "../utilities/utils";
import { readFileSync } from "fs";
import { join } from "path";

export class MainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "parakeet.mainView";

  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

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

    webviewView.webview.onDidReceiveMessage((message: any) => {
      const command = message.command;
      const text = message.text;

      switch (command) {
        case "hello":
          // Code that should run in response to the hello message command
          vscode.window.showInformationMessage(text);
          return;
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Ensure when creating the WebviewPanel you use:
    // enableScripts: true,
    // localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'build')]
  
    const buildUri = vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'build');
    const indexUri = vscode.Uri.joinPath(buildUri, 'index.html');
  
    let html = readFileSync(indexUri.fsPath, 'utf8');
    const nonce = getNonce();
  
    const toWebviewUri = (p: string) => {
      const clean = p.replace(/^\//, '');
      return webview.asWebviewUri(vscode.Uri.joinPath(buildUri, ...clean.split('/'))).toString();
    };
  
    // 1) Inject CSP + normalize /index.html -> ./ BEFORE SvelteKit boots
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${webview.cspSource} data:;
    font-src ${webview.cspSource};
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}' ${webview.cspSource};
    script-src-elem 'nonce-${nonce}' ${webview.cspSource};
    connect-src ${webview.cspSource} https:;
    worker-src ${webview.cspSource};
  ">
  <script nonce="${nonce}">
    try {
      const p = location.pathname;
      if (p.endsWith('/index.html')) {
        history.replaceState({}, '', p.slice(0, -'/index.html'.length) + './');
      }
    } catch {}
  </script>`
    );
  
    // 2) Rewrite asset URLs in attributes (src/href), including rel="modulepreload"
    const ATTR_URL = /(src|href)=["'](?!https?:|data:|vscode-webview:)([^"']+)["']/g;
    html = html.replace(ATTR_URL, (m, attr, url) => {
      if (/^(?:\.\/|\/|_app\/|assets\/|favicon|manifest\.webmanifest)/.test(url)) {
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
    html = html.replace(/<script(?![^>]*\bnonce=)([^>]*)>/g, `<script nonce="${nonce}"$1>`);
  
    // 5) Expose VS Code API
    html = html.replace(
      /<\/body>\s*<\/html>\s*$/i,
      `<script nonce="${nonce}">window.vscode = acquireVsCodeApi();</script></body></html>`
    );
  
    return html;
  }
  
}
