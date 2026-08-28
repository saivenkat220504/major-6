import {
  BarcodeFormat,
  DecodeHintType,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
  MultiFormatReader,
  PDF417Reader,
} from '@zxing/library';

export interface BoardingPassData {
  ticket_id: string;
  passenger_name: string;
  flight_id: string;
  date: string;
  from: string;
  to: string;
  terminal: string;
  seat: string;
  // Legacy field aliases for backwards compatibility
  name?: string;
  seat_no?: string;
}

// ── Shared hints map for ZXing ─────────────────────────────────────────────────
function buildHints(): Map<DecodeHintType, any> {
  const hints = new Map<DecodeHintType, any>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.PDF_417,
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.AZTEC,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

/**
 * Robust, multi-layered image loading pipeline for Android WebView & Mobile Browsers.
 * 
 * Step 1: Try native `createImageBitmap(file)` — zero DOM, zero URL, zero base64 overhead.
 *         Supported natively in Chromium / Android WebView / Safari 15+.
 * Step 2: Try `URL.createObjectURL(file)` with HTMLImageElement.
 * Step 3: Try `FileReader.readAsDataURL(file)` with HTMLImageElement.
 */
async function loadFileToImageData(file: File): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  // Method 1: createImageBitmap (Native Android WebView / Browser API)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx && canvas.width > 0 && canvas.height > 0) {
        ctx.drawImage(bitmap, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        bitmap.close();
        return { data: imageData.data, width: canvas.width, height: canvas.height };
      }
    } catch (err) {
      console.warn('[BarcodeDecoder] createImageBitmap failed, trying URL fallback:', err);
    }
  }

  // Method 2: HTMLImageElement via Blob URL
  try {
    const imageData = await loadImageViaBlobUrl(file);
    return imageData;
  } catch (err) {
    console.warn('[BarcodeDecoder] Blob URL load failed, trying DataURL fallback:', err);
  }

  // Method 3: FileReader readAsDataURL fallback
  return loadViaFileReader(file);
}

function loadImageViaBlobUrl(file: File): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        URL.revokeObjectURL(objectUrl);

        if (canvas.width === 0 || canvas.height === 0) {
          return reject(new Error('Image has zero dimensions'));
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return reject(new Error('Canvas 2D context unavailable'));

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({ data: imageData.data, width: canvas.width, height: canvas.height });
      } catch (e: any) {
        URL.revokeObjectURL(objectUrl);
        reject(e);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Blob URL image load failed'));
    };

    img.src = objectUrl;
  });
}

function loadViaFileReader(file: File): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result;
      if (!result || typeof result !== 'string') {
        return reject(new Error('FileReader produced no output'));
      }

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;

          if (canvas.width === 0 || canvas.height === 0) {
            return reject(new Error('Image has zero dimensions'));
          }

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return reject(new Error('Canvas 2D context unavailable'));

          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve({ data: imageData.data, width: canvas.width, height: canvas.height });
        } catch (e: any) {
          reject(e);
        }
      };

      img.onerror = () => {
        reject(new Error('Image element failed to parse FileReader data URL. File format may be unsupported.'));
      };

      img.src = result;
    };

    reader.onerror = () => {
      reject(new Error(`FileReader failed to read selected file`));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Converts RGBA pixel data (from canvas.getImageData) into the Uint8ClampedArray
 * of luminance (grayscale) bytes that ZXing's RGBLuminanceSource expects.
 */
function rgbaToRGB(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const alpha = rgba[i + 3] / 255;
    rgb[j] = Math.round(rgba[i] * alpha + 255 * (1 - alpha));
    rgb[j + 1] = Math.round(rgba[i + 1] * alpha + 255 * (1 - alpha));
    rgb[j + 2] = Math.round(rgba[i + 2] * alpha + 255 * (1 - alpha));
  }
  return rgb;
}

/**
 * Attempt to decode a barcode from given pixel data using ZXing directly.
 */
function decodeFromPixels(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number
): string | null {
  const hints = buildHints();
  const rgb = rgbaToRGB(rgbaData, width, height);

  // Dedicated PDF417 reader
  try {
    const luminanceSource = new RGBLuminanceSource(rgb, width, height);
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
    const pdfReader = new PDF417Reader();
    const result = pdfReader.decode(binaryBitmap, hints);
    if (result?.getText()) return result.getText();
  } catch { /* try next */ }

  // Multi-format reader fallback
  try {
    const luminanceSource = new RGBLuminanceSource(rgb, width, height);
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
    const multiReader = new MultiFormatReader();
    multiReader.setHints(hints);
    const result = multiReader.decode(binaryBitmap);
    if (result?.getText()) return result.getText();
  } catch { /* try next */ }

  return null;
}

/**
 * Applies image processing transformations for multi-pass decoding attempts.
 */
function applyTransform(
  sourceRgba: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  angle: 0 | 90 | 180 | 270,
  scale: number,
  contrast: boolean
): { data: Uint8ClampedArray; width: number; height: number } | null {
  try {
    const canvas = document.createElement('canvas');
    const isSideways = angle === 90 || angle === 270;
    canvas.width = Math.floor((isSideways ? srcHeight : srcWidth) * scale);
    canvas.height = Math.floor((isSideways ? srcWidth : srcHeight) * scale);
    if (canvas.width === 0 || canvas.height === 0) return null;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = srcWidth;
    srcCanvas.height = srcHeight;
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (!srcCtx) return null;
    const srcImgData = srcCtx.createImageData(srcWidth, srcHeight);
    srcImgData.data.set(sourceRgba);
    srcCtx.putImageData(srcImgData, 0, 0);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(srcCanvas, -srcWidth / 2, -srcHeight / 2);
    ctx.restore();

    if (contrast) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const bin = gray > 128 ? 255 : 0;
        d[i] = bin; d[i + 1] = bin; d[i + 2] = bin;
        d[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const out = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data: out.data, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

/**
 * Parses raw barcode text (IATA BCBP standard, JSON payload, or Delimited text)
 * into the canonical SIPAS BoardingPassData structure.
 */
export function parseBoardingPassBarcode(rawInput: string): BoardingPassData {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error('Barcode content is empty');
  }

  const raw = rawInput.trim();

  // ── 1. JSON Payload Format ──────────────────────────────────────────────────
  if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
    try {
      const p = JSON.parse(raw);
      const dataObj = Array.isArray(p) ? p[0] : p;
      if (dataObj && typeof dataObj === 'object') {
        const ticket_id = String(dataObj.ticket_id || dataObj.pnr || dataObj.booking_reference || dataObj.id || 'N/A').trim();
        const passenger_name = String(dataObj.passenger_name || dataObj.name || dataObj.passenger || 'Unknown').trim();
        const flight_id = String(dataObj.flight_id || dataObj.flightNumber || dataObj.flight_no || dataObj.flight || 'N/A').trim().toUpperCase();
        const date = String(dataObj.date || dataObj.flight_date || 'N/A').trim();
        const fromCode = String(dataObj.from || dataObj.origin || dataObj.departure || 'N/A').trim().toUpperCase();
        const toCode = String(dataObj.to || dataObj.destination || dataObj.arrival || 'N/A').trim().toUpperCase();
        const seat = String(dataObj.seat || dataObj.seat_assignment || dataObj.seat_no || 'N/A').trim().toUpperCase();

        if (passenger_name === 'Unknown' && flight_id === 'N/A' && ticket_id === 'N/A') {
          throw new Error('JSON payload does not contain valid boarding pass fields');
        }

        return { ticket_id, passenger_name, flight_id, date, from: fromCode, to: toCode, terminal: 'T1', seat, name: passenger_name, seat_no: seat };
      }
    } catch (e: any) {
      if (e.message?.includes('valid boarding pass fields')) throw e;
    }
  }

  // ── 2. Standard IATA BCBP (Bar Coded Boarding Pass) Format ─────────────────
  if (raw[0] === 'M') {
    let nameRaw = '';
    let pnr = 'N/A';
    let fromCode = 'N/A';
    let toCode = 'N/A';
    let carrier = '';
    let flightNum = '';
    let julianStr = '';
    let seat = 'N/A';

    if (raw.length >= 45) {
      nameRaw = raw.substring(2, 22).trim();
      pnr = raw.substring(23, 30).trim();
      fromCode = raw.substring(30, 33).trim().toUpperCase();
      toCode = raw.substring(33, 36).trim().toUpperCase();
      carrier = raw.substring(36, 39).trim().toUpperCase();
      flightNum = raw.substring(39, 44).trim().replace(/^0+/, '');
      julianStr = raw.substring(44, 47).trim();
      if (raw.length >= 52) {
        seat = raw.substring(48, 52).trim().replace(/^0+/, '') || 'N/A';
      }
    }

    if (!/^[A-Z]{3}$/.test(fromCode) || !/^[A-Z]{3}$/.test(toCode)) {
      const bcbpRegex = /^M[1-9]?([A-Z\/\s]+?)(?:[E\s])([A-Z0-9]{5,8})\s*([A-Z]{3})([A-Z]{3})([A-Z0-9\s]{2,3})\s*([A-Z0-9]{1,5})\s*([0-9]{3})[A-Z\s]?([A-Z0-9]{2,4})?/i;
      const m = raw.match(bcbpRegex);
      if (m) {
        nameRaw = m[1].trim(); pnr = m[2].trim(); fromCode = m[3].toUpperCase(); toCode = m[4].toUpperCase();
        carrier = m[5].trim().toUpperCase(); flightNum = m[6].trim().replace(/^0+/, '');
        julianStr = m[7].trim(); if (m[8]) seat = m[8].trim().replace(/^0+/, '') || 'N/A';
      }
    }

    let passenger_name = nameRaw;
    if (nameRaw.includes('/')) {
      const [surname, rest] = nameRaw.split('/');
      const cleanRest = (rest || '').trim().replace(/\s+(MR|MRS|MS|MISS|DR|PROF)$/i, '');
      passenger_name = cleanRest ? `${cleanRest} ${surname.trim()}`.trim() : surname.trim();
    }

    const flight_id = (carrier + flightNum).trim() || 'N/A';
    let date = 'N/A';
    const julianDay = parseInt(julianStr, 10);
    if (!isNaN(julianDay) && julianDay >= 1 && julianDay <= 366) {
      const d = new Date(new Date().getFullYear(), 0, julianDay);
      date = d.toISOString().split('T')[0];
    }

    return { ticket_id: pnr || 'N/A', passenger_name: passenger_name || 'Unknown', flight_id, date, from: fromCode, to: toCode, terminal: 'T1', seat, name: passenger_name, seat_no: seat };
  }

  // ── 3. Key-Value / Delimited Text Fallback ──────────────────────────────────
  const pnrMatch = raw.match(/(?:PNR|TICKET|BOOKING|ID|RECORD)[:=\s]+([A-Z0-9]+)/i);
  const nameMatch = raw.match(/(?:NAME|PASSENGER)[:=\s]+([A-Z\s\/]+?)(?=[|,\n\r;]|$)/i);
  const flightMatch = raw.match(/(?:FLIGHT|FLIGHT_NO|FLIGHT_ID)[:=\s]+([A-Z0-9-]+)/i);
  const seatMatch = raw.match(/(?:SEAT|SEAT_NO|SEAT_ASSIGNMENT)[:=\s]+([A-Z0-9]+)/i);
  const fromMatch = raw.match(/(?:FROM|ORIGIN|DEPARTURE)[:=\s]+([A-Z]{3})/i);
  const toMatch = raw.match(/(?:TO|DEST|DESTINATION|ARRIVAL)[:=\s]+([A-Z]{3})/i);
  const dateMatch = raw.match(/(?:DATE)[:=\s]+([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);

  if (flightMatch || pnrMatch || nameMatch) {
    let pname = nameMatch ? nameMatch[1].trim() : 'Unknown';
    if (pname.includes('/')) { const [s, r] = pname.split('/'); pname = `${r.trim()} ${s.trim()}`.trim(); }
    return {
      ticket_id: pnrMatch?.[1].trim() ?? 'N/A', passenger_name: pname || 'Unknown',
      flight_id: flightMatch?.[1].trim().toUpperCase() ?? 'N/A', date: dateMatch?.[1].trim() ?? 'N/A',
      from: fromMatch?.[1].trim().toUpperCase() ?? 'N/A', to: toMatch?.[1].trim().toUpperCase() ?? 'N/A',
      terminal: 'T1', seat: seatMatch?.[1].trim().toUpperCase() ?? 'N/A',
      name: pname, seat_no: seatMatch?.[1].trim().toUpperCase() ?? 'N/A',
    };
  }

  throw new Error('Barcode decoded successfully, but does not contain valid boarding pass data.');
}

/**
 * Decodes a PDF417 (or multi-format barcode) from an uploaded image File.
 */
export async function decodeBarcodeImage(file: File): Promise<BoardingPassData> {
  if (!file) {
    throw new Error('No file provided to barcode decoder');
  }

  if (file.size === 0) {
    throw new Error('The selected file is empty (0 bytes). Please select a valid image.');
  }

  // Step 1: Multi-layered image loading pipeline (createImageBitmap -> BlobURL -> FileReader)
  let pixelData: { data: Uint8ClampedArray; width: number; height: number };
  try {
    pixelData = await loadFileToImageData(file);
  } catch (loadErr: any) {
    throw new Error(`Image load failed: ${loadErr.message}`);
  }

  const { data: rgbaData, width, height } = pixelData;

  // Step 2: Attempt 1 — decode original pixels directly
  const raw1 = decodeFromPixels(rgbaData, width, height);
  if (raw1) return parseBoardingPassBarcode(raw1);

  // Step 3: Multi-pass — try rotations and contrast enhancement
  const angles: Array<0 | 90 | 180 | 270> = [180, 90, 270];
  const scales = [1.0, 1.5, 2.0];
  const contrastOptions = [false, true];

  for (const contrast of contrastOptions) {
    for (const scale of scales) {
      for (const angle of angles) {
        const transformed = applyTransform(rgbaData, width, height, angle, scale, contrast);
        if (!transformed) continue;
        const raw = decodeFromPixels(transformed.data, transformed.width, transformed.height);
        if (raw) return parseBoardingPassBarcode(raw);
      }
    }
  }

  // Step 4: No barcode found
  throw new Error(
    'No valid PDF417 boarding pass barcode was detected in the image. ' +
    'Please ensure the barcode is clearly visible, well-lit, and in focus.'
  );
}

// Backwards compatibility exports
export const decodeQRImage = decodeBarcodeImage;
