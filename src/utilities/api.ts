import { getBaseUrl } from "./env";

export const validateStreamKey = async (streamKey: string | undefined) => {
  if (!streamKey) {
    return false;
  }

  const response = await fetch(`${getBaseUrl()}/api/v1/extension/auth/validate`, {
    method: "POST",
    headers: {
      "X-Parakeet-Stream-Key": streamKey,
    },
  });
  return response.ok;
};
