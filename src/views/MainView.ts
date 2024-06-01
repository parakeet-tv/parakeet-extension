import { getNonce } from "../utilities/getNonce";
import * as vscode from "vscode";
import { getUri } from "../utilities/getUri";

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

      localResourceRoots: [this._extensionUri],
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

  private _getHtmlForWebview(webview: vscode.Webview) {
    const stylesUri = getUri(webview, this._extensionUri, ["webview-ui", "dist", "assets", "index.css"]);
    // The JS file from the Svelte build output
    const scriptUri = getUri(webview, this._extensionUri, ["webview-ui", "dist", "assets", "index.js"]);

    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();

    return /*html*/ `
    <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <script defer nonce="${nonce}" type="module" src="${scriptUri}"></script>
            <link rel="stylesheet" type="text/css" href="${stylesUri}" />
        </head>
        <body>
            <div id="app"></div>
        </body>
        </html>
    `;
  }
}
