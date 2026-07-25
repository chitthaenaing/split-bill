import { dataUrlToBlob, prepareReceiptImage } from "@/lib/image-prep";
import { readJsonResponse } from "@/lib/read-json-response";
import type { ExtractionResponse } from "@/types/bill";

/**
 * Client helper: compress a receipt data URL and POST multipart to /api/extract.
 * Shared by the upload card and the warning-banner Rescan action.
 */
export async function extractBillFromReceiptDataUrl(
  receiptDataUrl: string,
  filename = "receipt.jpg"
): Promise<ExtractionResponse> {
  const imageDataUrl = await prepareReceiptImage(receiptDataUrl);
  const blob = dataUrlToBlob(imageDataUrl);
  const form = new FormData();
  form.append("file", blob, filename);

  const res = await fetch("/api/extract", {
    method: "POST",
    body: form,
  });
  const data = await readJsonResponse<ExtractionResponse | { error: string }>(
    res
  );
  if (!res.ok || "error" in data) {
    throw new Error(
      "error" in data ? data.error : `Request failed (${res.status})`
    );
  }
  return data;
}
