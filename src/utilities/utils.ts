import { Uri, Webview } from "vscode";
import * as vscode from "vscode";
import simpleGit from "simple-git";

/**
 * A helper function that returns a unique alphanumeric identifier called a nonce.
 *
 * @remarks This function is primarily used to help enforce content security
 * policies for resources/scripts being executed in a webview context.
 *
 * @returns A nonce
 */
export function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * A helper function which will get the webview URI of a given file or resource.
 *
 * @remarks This URI can be used within a webview's HTML as a link to the
 * given file/resource.
 *
 * @param webview A reference to the extension webview
 * @param extensionUri The URI of the directory containing the extension
 * @param pathList An array of strings representing the path to a file/resource
 * @returns A URI pointing to the file/resource
 */
export function getUri(
  webview: Webview,
  extensionUri: Uri,
  pathList: string[]
) {
  return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

/**
 * Returns true if a file uri is ignored by the current git workspace, false otherwise.
 */
export const isFileGitIgnored = async (uri: vscode.Uri): Promise<boolean> => {
    const rootFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!rootFolder) {
        return false;
    }

    const git = simpleGit(rootFolder.uri.path);

    try {
        const ignored = await git.checkIgnore(uri.path);
        return ignored.length > 0;
    } catch (error) {
        console.error("Error checking if file is ignored by Git:", error);
        return false;
    }
};