import { Uri, type Webview } from "vscode";
import * as vscode from "vscode";
import type { API, GitExtension } from "../git";
import * as path from "path";

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
export async function isFileGitIgnored(uri: vscode.Uri): Promise<boolean> {
    // Grab the Git extension
    const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
    if (!gitExt || !gitExt.enabled) return false;
  
    const api: API = gitExt.getAPI(1);
  
    // Find the repository that owns this URI
    const repo =
      api.getRepository(uri) ??
      api.repositories.find(r => uri.fsPath.startsWith(r.rootUri.fsPath));
  
    if (!repo) return false;
  
    // VS Code's Git API returns the subset of URIs that are ignored
    const ignored = await repo.checkIgnore([uri.fsPath]);
    return ignored.size > 0;
  }

/**
 * Returns true if a file is larger than 0.8 MB, false otherwise.
 */
export async function isFileTooLarge(uri: vscode.Uri): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    const maxSizeBytes = 0.8 * 1024 * 1024; // 0.8 MB in bytes
    return stat.size > maxSizeBytes;
  } catch (error) {
    // If we can't stat the file, assume it's not too large
    return false;
  }
}

/**
 * Generates relevant tags based on the repository analysis
 */
export async function generateTagsFromRepo(): Promise<string[]> {
  const tags = new Set<string>();

  // Get workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return [];

  // Grab the Git extension
  const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git')?.exports;
  if (!gitExt || !gitExt.enabled) return [];

  const api: API = gitExt.getAPI(1);

  for (const folder of workspaceFolders) {
    // Find the repository
    const repo = api.repositories.find(r => folder.uri.fsPath.startsWith(r.rootUri.fsPath));
    if (!repo) continue;

    // Add tags from package.json if it exists
    const packageJsonUri = Uri.joinPath(folder.uri, 'package.json');
    try {
      const packageJsonContent = await vscode.workspace.fs.readFile(packageJsonUri);
      const packageJson = JSON.parse(packageJsonContent.toString());

      // Add programming language/framework tags
      if (packageJson.dependencies || packageJson.devDependencies) {
        const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        // Common framework/library mappings
        const frameworkMappings: { [key: string]: string } = {
          'react': 'react',
          'vue': 'vue',
          '@angular': 'angular',
          'svelte': 'svelte',
          'express': 'nodejs',
          'typescript': 'typescript',
          'webpack': 'webpack',
          'vite': 'vite',
          'next': 'nextjs',
          'nuxt': 'nuxt'
        };

        for (const dep of Object.keys(allDeps)) {
          const tag = frameworkMappings[dep];
          if (tag) tags.add(tag);
        }
      }
    } catch (error) {
      // package.json doesn't exist or is invalid, continue
    }

    // Analyze file extensions in the workspace
    const pattern = new vscode.RelativePattern(folder, '**/*');
    const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);

    const extensions = new Set<string>();
    for (const file of files) {
      const ext = path.extname(file.fsPath).toLowerCase();
      extensions.add(ext);
    }

    // Map extensions to language tags
    const languageMappings: { [key: string]: string } = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'react',
      '.tsx': 'react',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'sass',
      '.less': 'less',
      '.vue': 'vue',
      '.svelte': 'svelte'
    };

    for (const ext of extensions) {
      const tag = languageMappings[ext];
      if (tag) tags.add(tag);
    }

    // Add general tags based on project structure
    const hasSrc = await vscode.workspace.fs.stat(Uri.joinPath(folder.uri, 'src')).then(() => true, () => false);
    const hasLib = await vscode.workspace.fs.stat(Uri.joinPath(folder.uri, 'lib')).then(() => true, () => false);
    const hasTest = await vscode.workspace.fs.stat(Uri.joinPath(folder.uri, 'test')).then(() => true, () => false) ||
                   await vscode.workspace.fs.stat(Uri.joinPath(folder.uri, 'tests')).then(() => true, () => false);

    if (hasSrc || hasLib) tags.add('web-development');
    if (hasTest) tags.add('testing');

    // Add VS Code extension tag if this is a VS Code extension
    const hasExtensionJson = await vscode.workspace.fs.stat(Uri.joinPath(folder.uri, '.vscode')).then(() => true, () => false);
    if (hasExtensionJson) tags.add('vscode-extension');
  }

  // Convert to array and limit to 10 tags
  return Array.from(tags).slice(0, 10);
}