import * as vscode from "vscode";
import { stopAllStreams } from "../stream";
import { validateStreamKey } from "./api";
import z from "zod";
import { error, log } from "../extension";
import type { ChatUserMsg } from "parakeet-proto";

const settingsStateSchema = z.object({
  shareOption: z
    .enum(["current-file", "directory", "everything"])
    .default("current-file"),
  streamTitle: z.string().default(""),
  streamDescription: z.string().default(""),
  saveVod: z.boolean().default(false),
  userTags: z.array(z.string()).default([]),
  autoTags: z.array(z.string()).default([]),
});

export type SettingsState = z.infer<typeof settingsStateSchema>;

// Store webview references for auth state updates
let registeredWebviews: vscode.Webview[] = [];

/**
 * Register a webview to receive auth state updates
 * @param webview VSCode webview instance
 */
export function registerWebviewForAuthUpdates(webview: vscode.Webview) {
  registeredWebviews.push(webview);
}

/**
 * Unregister a webview from auth state updates
 * @param webview VSCode webview instance
 */
export function unregisterWebviewForAuthUpdates(webview: vscode.Webview) {
  registeredWebviews = registeredWebviews.filter((w) => w !== webview);
}

/**
 * Post authentication state to all registered webviews
 * @param authState Authentication state object
 */
function postAuthStateToWebviews(authState: any) {
  const message = {
    command: "authStateChanged",
    authenticated: authState.authenticated,
    user: authState.user,
  };

  registeredWebviews.forEach((webview) => {
    try {
      webview.postMessage(message);
    } catch (error) {
      console.error("Error posting auth state to webview:", error);
    }
  });
}

export const clearAuthState = async (context: vscode.ExtensionContext) => {
  await context.secrets.delete("parakeet-token");
  await context.secrets.delete("parakeet-userId");
  await context.secrets.delete("parakeet-username");
  await context.secrets.delete("parakeet-imageUrl");
};

/**
 * Sync authentication state - validate token and update webviews
 * @param context VSCode extension context
 */
export const syncAuthState = async (context: vscode.ExtensionContext) => {
  try {
    const token = await context.secrets.get("parakeet-token");
    const userId = await context.secrets.get("parakeet-userId");
    const username = await context.secrets.get("parakeet-username");
    const imageUrl = await context.secrets.get("parakeet-imageUrl");

    if (!token) {
      const authState = {
        authenticated: false,
        user: null,
      };

      postAuthStateToWebviews(authState);
      return authState;
    }

    const isValid = await validateStreamKey(token, context);

    if (!isValid) {
      log("Invalid stream key");
    }

    // Check if all auth info is present
    if (!token || !userId || !username || !imageUrl || !isValid) {
      // Clear any partial auth data and set as unauthenticated
      log("Clearing auth state");
      await clearAuthState(context);

      const authState = {
        authenticated: false,
        user: null,
      };

      postAuthStateToWebviews(authState);
      return authState;
    }

    const authState = {
      authenticated: true,
      user: {
        id: userId,
        username: username,
        imageUrl: imageUrl,
      },
    };

    postAuthStateToWebviews(authState);
    return authState;
  } catch (err) {
    error("Error syncing auth state:", err);
    const authState = {
      authenticated: false,
      user: null,
    };

    postAuthStateToWebviews(authState);
    return authState;
  }
};

/**
 * Store a chat message in persistent state (keeps last 50 messages)
 * @param context VSCode extension context
 * @param message Chat message to store
 */
export const storeChatMessage = async (
  context: vscode.ExtensionContext,
  message: ChatUserMsg
) => {
  try {
    const chatHistory = context.globalState.get<ChatUserMsg[]>('messageHistory') || [];
    
    // Add new message and keep only last 50
    const updatedHistory = [...chatHistory, message].slice(-50);
    
    await context.globalState.update('messageHistory', updatedHistory);
  } catch (err) {
    error("Error storing chat message:", err);
  }
};

/**
 * Get chat message history from persistent state
 * @param context VSCode extension context
 * @returns Array of chat messages
 */
export const getChatHistory = async (
  context: vscode.ExtensionContext
): Promise<ChatUserMsg[]> => {
  try {
    return context.globalState.get<ChatUserMsg[]>('messageHistory') || [];
  } catch (err) {
    error("Error getting chat history:", err);
    return [];
  }
};

/**
 * Clear chat history from persistent state
 * @param context VSCode extension context
 */
export const clearChatHistory = async (context: vscode.ExtensionContext) => {
  try {
    await context.globalState.update('messageHistory', []);
  } catch (err) {
    error("Error clearing chat history:", err);
  }
};

/**
 * Get settings from context state
 * @param context VSCode extension context
 * @returns Settings state
 */
export const getSettings = async (
  context: vscode.ExtensionContext
): Promise<SettingsState> => {
  try {
    const settings = context.globalState.get<SettingsState>('parakeet-settings');
    return settingsStateSchema.parse(settings || {});
  } catch (err) {
    error("Error getting settings:", err);
    return settingsStateSchema.parse({});
  }
};

/**
 * Save settings to context state
 * @param context VSCode extension context
 * @param settings Settings to save
 */
export const saveSettings = async (
  context: vscode.ExtensionContext,
  settings: SettingsState
) => {
  try {
    const validatedSettings = settingsStateSchema.parse(settings);
    await context.globalState.update('parakeet-settings', validatedSettings);
  } catch (err) {
    error("Error saving settings:", err);
  }
};

export const logOut = async (context: vscode.ExtensionContext) => {
  // Stop all streams and disconnect socket before clearing auth data
  stopAllStreams();

  await clearAuthState(context);
  // Clear chat history on logout
  await clearChatHistory(context);

  syncAuthState(context);
};
