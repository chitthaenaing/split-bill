/**
 * Parse a fetch Response as JSON with Safari-friendly errors.
 *
 * On WebKit, `response.json()` on an HTML/plain error page throws
 * "The string did not match the expected pattern." instead of a useful
 * JSON parse message. Read as text first and rethrow something actionable.
 */
export async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) {
    if (!res.ok) {
      throw new Error(httpErrorMessage(res.status));
    }
    throw new Error("Empty response from server.");
  }

  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    if (res.status === 413) {
      throw new Error(
        "That image is too large for the server. Try a clearer, closer crop."
      );
    }
    if (!res.ok) {
      throw new Error(httpErrorMessage(res.status));
    }
    throw new Error("Server returned an unexpected response. Please try again.");
  }

  return data as T;
}

function httpErrorMessage(status: number): string {
  if (status === 413) {
    return "That image is too large for the server. Try a clearer, closer crop.";
  }
  if (status === 429) {
    return "Too many requests — wait a moment and try again.";
  }
  if (status >= 500) {
    return `Server error (${status}). Please try again in a moment.`;
  }
  if (status === 408 || status === 504) {
    return "The request timed out. Try again with a clearer photo.";
  }
  return `Request failed (${status}).`;
}
