import * as vscode from "vscode";
import { MainViewProvider } from "./views/MainView";

export function activate(context: vscode.ExtensionContext) {
  const provider = new MainViewProvider(context.extensionUri);

  context.subscriptions.push(vscode.window.registerWebviewViewProvider(MainViewProvider.viewType, provider));
}
