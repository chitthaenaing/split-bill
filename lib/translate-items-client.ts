import { readJsonResponse } from "@/lib/read-json-response";

type TranslateResponse = {
  translations: string[];
  error?: string;
};

/** Call `/api/translate-items` and return one gloss per input name. */
export async function fetchItemTranslations(
  names: string[],
  targetLang = "English"
): Promise<string[]> {
  const res = await fetch("/api/translate-items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ names, targetLang }),
  });
  const data = await readJsonResponse<TranslateResponse>(res);
  if (!res.ok || data.error) {
    throw new Error(data.error || `Translation failed (${res.status})`);
  }
  return Array.isArray(data.translations) ? data.translations : [];
}
