import * as vscode from "vscode";

/**
 * Global extension mode - set during extension activation
 */
let extensionMode: vscode.ExtensionMode | undefined;

/**
 * Set the global extension mode - should be called during extension activation
 * @param mode The extension mode from context.extensionMode
 */
export function setExtensionMode(mode: vscode.ExtensionMode): void {
  extensionMode = mode;
}

/**
 * Get the current extension mode
 * @throws Error if extension mode hasn't been set yet
 */
function getExtensionMode(): vscode.ExtensionMode {
  if (extensionMode === undefined) {
    throw new Error("Extension mode not set. Make sure setExtensionMode() is called during activation.");
  }
  return extensionMode;
}

/**
 * Check if the extension is running in development mode
 */
export const isDev = (): boolean => getExtensionMode() === vscode.ExtensionMode.Development;

/**
 * Check if the extension is running in production mode
 */
export const isProd = (): boolean => getExtensionMode() === vscode.ExtensionMode.Production;

/**
 * Check if the extension is running in test mode
 */
export const isTest = (): boolean => getExtensionMode() === vscode.ExtensionMode.Test;

export const getBaseUrl = (): string => {
  if (isDev()) {
    return "http://localhost:5173";
  }
  return "https://parakeet.tv";
};