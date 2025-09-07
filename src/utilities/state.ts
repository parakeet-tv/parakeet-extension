import * as vscode from "vscode";
import { decodeJwt } from "jose";

/**
 * Check if JWT token is expired using jose library
 * @param token JWT token string
 * @returns true if expired or invalid, false if valid
 */
function isTokenExpired(token: string): boolean {
  try {
    const payload = decodeJwt(token);
    
    // Check if exp claim exists
    if (!payload.exp) {
      console.warn('JWT token does not have exp claim');
      return true;
    }
    
    // Check if token is expired (exp is in seconds, Date.now() is in milliseconds)
    const expirationTime = payload.exp * 1000;
    const currentTime = Date.now();
    
    return expirationTime <= currentTime;
  } catch (error) {
    console.error('Error decoding JWT with jose:', error);
    return true; // Treat invalid tokens as expired
  }
}

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
  registeredWebviews = registeredWebviews.filter(w => w !== webview);
}

/**
 * Post authentication state to all registered webviews
 * @param authState Authentication state object
 */
function postAuthStateToWebviews(authState: any) {
  const message = {
    command: "authStateChanged",
    authenticated: authState.authenticated,
    user: authState.user
  };
  
  registeredWebviews.forEach(webview => {
    try {
      webview.postMessage(message);
    } catch (error) {
      console.error('Error posting auth state to webview:', error);
    }
  });
}

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
    
    // Check if all auth info is present
    if (!token || !userId || !username || !imageUrl) {
      // Clear any partial auth data and set as unauthenticated
      await context.secrets.delete("parakeet-token");
      await context.secrets.delete("parakeet-userId");
      await context.secrets.delete("parakeet-username");
      await context.secrets.delete("parakeet-imageUrl");
      
      const authState = {
        authenticated: false,
        user: null
      };
      
      postAuthStateToWebviews(authState);
      return authState;
    }
    
    // Check if token is expired
    if (isTokenExpired(token)) {
      console.log("token expired");
      // Clear all auth data if token is expired
      await context.secrets.delete("parakeet-token");
      await context.secrets.delete("parakeet-userId");
      await context.secrets.delete("parakeet-username");
      await context.secrets.delete("parakeet-imageUrl");
      
      const authState = {
        authenticated: false,
        user: null
      };
      
      postAuthStateToWebviews(authState);
      return authState;
    }
    
    const authState = {
      authenticated: true,
      user: {
        id: userId,
        username: username,
        imageUrl: imageUrl
      }
    };
    
    postAuthStateToWebviews(authState);
    return authState;
    
  } catch (error) {
    console.error('Error syncing auth state:', error);
    
    const authState = {
      authenticated: false,
      user: null
    };
    
    postAuthStateToWebviews(authState);
    return authState;
  }
};