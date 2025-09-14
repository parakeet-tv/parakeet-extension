import * as vscode from "vscode";
import { getBaseUrl } from "./env";

export const validateStreamKey = async (
  streamKey: string | undefined,
  context: vscode.ExtensionContext
) => {
  if (!streamKey) {
    return false;
  }

  const response = await fetch(`${getBaseUrl(context)}/api/v1/extension/auth/validate`, {
    method: "POST",
    headers: {
      "X-Parakeet-Stream-Key": streamKey,
    },
  });
  return response.ok;
};
