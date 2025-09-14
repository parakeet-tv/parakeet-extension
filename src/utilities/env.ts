import * as vscode from "vscode";

/**
 * Check if the extension is running in development mode
 */
export const isDev = (context: vscode.ExtensionContext): boolean =>
  context.extensionMode === vscode.ExtensionMode.Development;

/**
 * Check if the extension is running in production mode
 */
export const isProd = (context: vscode.ExtensionContext): boolean =>
  context.extensionMode === vscode.ExtensionMode.Production;

/**
 * Check if the extension is running in test mode
 */
export const isTest = (context: vscode.ExtensionContext): boolean =>
  context.extensionMode === vscode.ExtensionMode.Test;

/**
 * Get the base URL for API calls based on extension mode
 */
export const getBaseUrl = (context: vscode.ExtensionContext): string => {
  if (isDev(context)) {
    return "http://localhost:5173";
  }
  return "https://parakeet.tv";
};

/**
 * Get the stream server URL based on extension mode
 */
export const getStreamServerUrl = (context: vscode.ExtensionContext): string => {
  if (isProd(context)) {
    return "stream.parakeet.tv";
  } else if (isTest(context)) {
    return "stream-staging.parakeet.tv";
  } else {
    return "localhost:8787";
  }
};
