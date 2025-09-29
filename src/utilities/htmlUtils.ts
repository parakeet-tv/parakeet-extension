import * as vscode from "vscode";
import { readFileSync } from "fs";
import { getNonce } from "./utils";

/**
 * Configuration options for HTML processing
 */
export interface HtmlConfig {
  /** Whether this is chat mode (adds __PARAKEET_CHAT_MODE__ flag) */
  isChatMode?: boolean;
  /** Extension mode to inject */
  extensionMode: vscode.ExtensionMode;
}

/**
 * Processes the HTML for a webview, applying all necessary transformations
 * for use in VS Code extension webviews
 */
export function processHtmlForWebview(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  config: HtmlConfig
): string {
  const buildUri = vscode.Uri.joinPath(extensionUri, "webview-ui", "build");
  const indexUri = vscode.Uri.joinPath(buildUri, "index.html");

  let html = readFileSync(indexUri.fsPath, "utf8");
  const nonce = getNonce();

  const toWebviewUri = (p: string) => {
    const clean = p.replace(/^\//, "");
    return webview
      .asWebviewUri(vscode.Uri.joinPath(buildUri, ...clean.split("/")))
      .toString();
  };

  // Apply all HTML transformations
  html = injectCSPAndBase(html, webview, nonce);
  html = rewriteAssetUrls(html, toWebviewUri);
  html = rewriteDynamicImports(html, toWebviewUri);
  html = addNonceToScripts(html, nonce);
  html = overrideSvelteKitBasePath(html);
  html = injectExtensionFlags(html, nonce, config);
  html = exposeVSCodeApi(html, nonce);

  return html;
}

/**
 * Injects Content Security Policy and base href
 */
function injectCSPAndBase(
  html: string,
  webview: vscode.Webview,
  nonce: string
): string {
  return html.replace(
    /<head([^>]*)>/i,
    `<head$1>
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'none';
      img-src ${webview.cspSource} data: https://*.parakeet.tv https://parakeet.tv https://smart-kodiak-9.clerk.accounts.dev https://*.accounts.dev https://accounts.dev https://*.clerk.com https://clerk.com;
      font-src ${webview.cspSource} https://*.parakeet.tv https://parakeet.tv https://smart-kodiak-9.clerk.accounts.dev https://*.accounts.dev https://accounts.dev https://*.clerk.com https://clerk.com;
      style-src ${webview.cspSource} 'unsafe-inline' https://*.parakeet.tv https://parakeet.tv https://smart-kodiak-9.clerk.accounts.dev https://*.accounts.dev https://accounts.dev https://*.clerk.com https://clerk.com;
      script-src 'nonce-${nonce}' ${webview.cspSource} 'unsafe-eval' https://*.parakeet.tv https://parakeet.tv https://smart-kodiak-9.clerk.accounts.dev https://*.accounts.dev https://accounts.dev https://*.clerk.com https://clerk.com;
      script-src-elem 'nonce-${nonce}' ${webview.cspSource} https://*.parakeet.tv https://parakeet.tv https://smart-kodiak-9.clerk.accounts.dev https://*.accounts.dev https://accounts.dev https://*.clerk.com https://clerk.com;
      connect-src ${webview.cspSource} https: wss: https://*.parakeet.tv https://parakeet.tv https://rtc.live.cloudflare.com https://smart-kodiak-9.clerk.accounts.dev https://*.accounts.dev https://accounts.dev https://*.clerk.com https://clerk.com;
      media-src ${webview.cspSource} blob: mediastream:;
      worker-src ${webview.cspSource} blob:;
      form-action 'none';
    ">
  <base href="./">`
  );
}

/**
 * Rewrites asset URLs in attributes (src/href), including rel="modulepreload"
 */
function rewriteAssetUrls(
  html: string,
  toWebviewUri: (url: string) => string
): string {
  const ATTR_URL =
    /(src|href)=["'](?!https?:|data:|vscode-webview:)([^"']+)["']/g;
  return html.replace(ATTR_URL, (m, attr, url) => {
    if (
      /^(?:\.\/|\/|_app\/|assets\/|favicon|manifest\.webmanifest)/.test(url)
    ) {
      return `${attr}="${toWebviewUri(url)}"`;
    }
    return m;
  });
}

/**
 * Rewrites dynamic import("./_app/...") inside inline scripts
 */
function rewriteDynamicImports(
  html: string,
  toWebviewUri: (url: string) => string
): string {
  return html.replace(
    /import\(\s*["'](\.\/_app\/[^"']+)["']\s*\)/g,
    (_m, rel) => `import("${toWebviewUri(rel)}")`
  );
}

/**
 * Adds nonce to every <script> tag for CSP compliance
 */
function addNonceToScripts(html: string, nonce: string): string {
  return html.replace(
    /<script(?![^>]*\bnonce=)([^>]*)>/g,
    `<script nonce="${nonce}"$1>`
  );
}

/**
 * Overrides SvelteKit base path dynamically
 */
function overrideSvelteKitBasePath(html: string): string {
  return html.replace(
    /(__sveltekit_\w+)\s*=\s*\{\s*base:\s*new URL\("\.",\s*location\)\.pathname\.slice\(0,\s*-1\)\s*\};/g,
    (match, varName) => `${varName} = { base: "" };`
  );
}

/**
 * Injects extension mode and chat mode flags
 */
function injectExtensionFlags(
  html: string,
  nonce: string,
  config: HtmlConfig
): string {
  const chatModeScript = config.isChatMode
    ? "  window.__PARAKEET_CHAT_MODE__ = true;\n"
    : "";

  return html.replace(
    /<head([^>]*)>/i,
    `<head$1>
<script nonce="${nonce}">
  // Set extension mode${
    config.isChatMode ? " and chat mode" : ""
  } for SvelteKit app before it loads
${chatModeScript}  window.__PARAKEET_EXTENSION_MODE__ = ${config.extensionMode};
</script>`
  );
}

/**
 * Exposes VS Code API to the webview
 */
function exposeVSCodeApi(html: string, nonce: string): string {
  return html.replace(
    /<\/body>\s*<\/html>\s*$/i,
    `<script nonce="${nonce}">window.vscode = acquireVsCodeApi();</script></body></html>`
  );
}
