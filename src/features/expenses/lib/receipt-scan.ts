// Browser only: makes a receipt small enough to send to the scanner.

const MAX_SCANNER_REQUEST_BYTES = 2_500_000;

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

export async function prepareReceiptForScanning(
  file: File,
): Promise<{ dataUrl: string; mimeType: string }> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_SCANNER_REQUEST_BYTES) throw new Error("PDF_TOO_LARGE");
    return { dataUrl: await fileToDataUrl(file), mimeType: file.type };
  }

  if (!file.type.startsWith("image/")) throw new Error("UNSUPPORTED_FILE");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    let maxDimension = 1800;
    let quality = 0.82;
    let output: Blob | null = null;

    // Camera photos can be 10–30 MB. Resize and progressively compress until
    // the base64 request remains safely below the Worker request body limit.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("IMAGE_PROCESSING_FAILED");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      output = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (!output) throw new Error("IMAGE_PROCESSING_FAILED");
      if (output.size <= MAX_SCANNER_REQUEST_BYTES) break;
      maxDimension = Math.round(maxDimension * 0.8);
      quality = Math.max(0.55, quality - 0.08);
    }

    if (!output || output.size > MAX_SCANNER_REQUEST_BYTES) throw new Error("IMAGE_TOO_LARGE");
    return { dataUrl: await fileToDataUrl(output), mimeType: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}
