import * as vscode from "vscode";
import simpleGit from "simple-git";

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
