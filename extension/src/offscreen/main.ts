import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { PSM, createWorker } from "tesseract.js";
import { findApprovedTokenRanges } from "../shared/tokenMatching";
import { APPROVED_TOKENS } from "../shared/tokenCatalog";
import type { ReplacementRegion } from "../shared/contracts";
import {
  OffscreenMessageType,
  type ImageArtifactScanResult,
  type OfficeArtifactScanResult,
  type OffscreenRequest,
  type PdfArtifactScanResult,
  type PdfPageRewriteInstruction,
  type PdfPageScanResult,
  type SurfaceScanResult,
  type SurfaceTokenRegion
} from "./messages";
import { rewriteOfficeXml, scanOfficeXml, type OfficeExtension } from "./officeXmlProcessor";

interface TextDetectionResult {
  rawValue?: string;
  boundingBox?: DOMRectReadOnly;
}

interface TextDetectorConstructor {
  new (): {
    detect: (source: CanvasImageSource) => Promise<TextDetectionResult[]>;
  };
}

interface OcrTextCandidate {
  rawValue: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>;

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const TESSERACT_WORKER_PATH = chrome.runtime.getURL("vendor/tesseract/worker.min.js");
const TESSERACT_CORE_PATH = chrome.runtime.getURL("vendor/tesseract-core");
const TESSERACT_LANG_PATH = chrome.runtime.getURL("vendor/tessdata");
const TESSERACT_UPSCALE_FACTOR = 3;
const TESSERACT_WHITELIST = "[]<>-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

let tesseractWorkerPromise: Promise<TesseractWorker> | null = null;

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }

  const request = message as { type?: string };
  if (!Object.values(OffscreenMessageType).includes(request.type as (typeof OffscreenMessageType)[keyof typeof OffscreenMessageType])) {
    return false;
  }

  const offscreenRequest = message as OffscreenRequest;
  void (async () => {
    switch (offscreenRequest.type) {
      case OffscreenMessageType.SCAN_VISUAL_SURFACES:
        sendResponse({
          surfaces: await scanVisualSurfaces(
            offscreenRequest.payload.screenshotDataUrl,
            offscreenRequest.payload.surfaces,
            offscreenRequest.payload.devicePixelRatio
          )
        });
        return;
      case OffscreenMessageType.SCAN_IMAGE_ARTIFACT:
        sendResponse({
          result: await scanImageArtifact(offscreenRequest.payload.bytes, offscreenRequest.payload.contentType)
        });
        return;
      case OffscreenMessageType.REWRITE_IMAGE_ARTIFACT:
        sendResponse({
          objectUrl: await rewriteImageArtifact(
            offscreenRequest.payload.bytes,
            offscreenRequest.payload.contentType,
            offscreenRequest.payload.replacements
          ),
          contentType: offscreenRequest.payload.contentType
        });
        return;
      case OffscreenMessageType.SCAN_PDF_ARTIFACT:
        sendResponse({
          result: await scanPdfArtifact(offscreenRequest.payload.bytes)
        });
        return;
      case OffscreenMessageType.REWRITE_PDF_ARTIFACT:
        sendResponse({
          objectUrl: await rewritePdfArtifact(offscreenRequest.payload.bytes, offscreenRequest.payload.pages),
          contentType: "application/pdf"
        });
        return;
      case OffscreenMessageType.SCAN_OFFICE_ARTIFACT:
        sendResponse({
          result: await scanOfficeArtifact(offscreenRequest.payload.bytes, offscreenRequest.payload.extension)
        });
        return;
      case OffscreenMessageType.REWRITE_OFFICE_ARTIFACT:
        sendResponse({
          objectUrl: await rewriteOfficeArtifact(
            offscreenRequest.payload.bytes,
            offscreenRequest.payload.extension,
            offscreenRequest.payload.mappings
          ),
          contentType: getOfficeContentType(offscreenRequest.payload.extension)
        });
        return;
      case OffscreenMessageType.REVOKE_OBJECT_URL:
        URL.revokeObjectURL(offscreenRequest.payload.objectUrl);
        sendResponse({ ok: true });
        return;
    }
  })().catch((error) => {
    const messageText = error instanceof Error ? error.message : "offscreen_processing_failed";
    sendResponse({ error: messageText });
  });

  return true;
});

async function scanVisualSurfaces(
  screenshotDataUrl: string,
  surfaces: Array<{ id: string; left: number; top: number; width: number; height: number }>,
  devicePixelRatio: number
): Promise<SurfaceScanResult[]> {
  const screenshotBitmap = await loadImageBitmap(await dataUrlToBlob(screenshotDataUrl));
  const rootCanvas = drawBitmapToCanvas(screenshotBitmap);
  const results: SurfaceScanResult[] = [];

  for (const surface of surfaces) {
    const cropCanvas = cropCanvasRegion(
      rootCanvas,
      Math.max(0, Math.round(surface.left * devicePixelRatio)),
      Math.max(0, Math.round(surface.top * devicePixelRatio)),
      Math.max(1, Math.round(surface.width * devicePixelRatio)),
      Math.max(1, Math.round(surface.height * devicePixelRatio))
    );

    const matches = await detectTokenRegions(cropCanvas, 1 / devicePixelRatio);
    results.push({
      surfaceId: surface.id,
      matches
    });
  }

  return results;
}

async function scanImageArtifact(bytes: ArrayBuffer, contentType: string): Promise<ImageArtifactScanResult> {
  const bitmap = await loadImageBitmap(new Blob([bytes], { type: contentType }));
  const canvas = drawBitmapToCanvas(bitmap);
  const matches = await detectTokenRegions(canvas, 1);
  return {
    width: canvas.width,
    height: canvas.height,
    matches
  };
}

async function rewriteImageArtifact(
  bytes: ArrayBuffer,
  contentType: string,
  replacements: ReplacementRegion[]
): Promise<string> {
  const blob = await rewriteImageArtifactToBlob(bytes, contentType, replacements);
  return URL.createObjectURL(blob);
}

async function rewriteImageArtifactToBlob(
  bytes: ArrayBuffer,
  contentType: string,
  replacements: ReplacementRegion[]
): Promise<Blob> {
  const bitmap = await loadImageBitmap(new Blob([bytes], { type: contentType }));
  const canvas = drawBitmapToCanvas(bitmap);
  const context = require2dContext(canvas);

  applyReplacementRegions(context, replacements, canvas.height);

  return canvasToBlob(canvas, contentType);
}

async function scanPdfArtifact(bytes: ArrayBuffer): Promise<PdfArtifactScanResult> {
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: PdfPageScanResult[] = [];

  for (let index = 0; index < pdf.numPages; index += 1) {
    const page = await pdf.getPage(index + 1);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();
    const textMatches: PdfPageScanResult["textMatches"] = [];

    for (const item of textContent.items as Array<{
      str?: string;
      width?: number;
      height?: number;
      transform?: number[];
    }>) {
      if (!item.str || !item.transform || !item.width) {
        continue;
      }

      const ranges = findApprovedTokenRanges(item.str);
      if (ranges.length === 0) {
        continue;
      }

      const height = Math.max(8, Math.abs(item.height ?? item.transform[3] ?? 12));
      const top = viewport.height - item.transform[5] - height;

      for (const range of ranges) {
        textMatches.push({
          token: range.token,
          left: item.transform[4] + (item.width * range.start) / Math.max(item.str.length, 1),
          top,
          width: (item.width * (range.end - range.start)) / Math.max(item.str.length, 1),
          height,
          pageWidth: viewport.width,
          pageHeight: viewport.height
        });
      }
    }

    if (textMatches.length > 0) {
      pages.push({
        pageIndex: index,
        renderMode: "preserve",
        textMatches
      });
      continue;
    }

    const scale = 2;
    const renderViewport = page.getViewport({ scale });
    const canvas = createCanvas(renderViewport.width, renderViewport.height);
    const context = require2dContext(canvas);
    await page.render({
      canvasContext: context,
      viewport: renderViewport
    }).promise;

    const ocrMatches = await detectTokenRegions(canvas, 1 / scale);
    pages.push({
      pageIndex: index,
      renderMode: ocrMatches.length > 0 ? "flatten" : "preserve",
      textMatches: ocrMatches.map((match) => ({
        token: match.token,
        left: match.left,
        top: match.top,
        width: match.width,
        height: match.height,
        pageWidth: viewport.width,
        pageHeight: viewport.height
      }))
    });
  }

  return {
    pageCount: pdf.numPages,
    pages
  };
}

async function rewritePdfArtifact(bytes: ArrayBuffer, pages: PdfPageRewriteInstruction[]): Promise<string> {
  const sourcePdf = await PDFDocument.load(bytes);
  const nextPdf = await PDFDocument.create();
  const helvetica = await nextPdf.embedFont(StandardFonts.Helvetica);
  const pdfForRendering = await pdfjsLib.getDocument({ data: bytes }).promise;

  for (let index = 0; index < sourcePdf.getPageCount(); index += 1) {
    const instruction = pages.find((page) => page.pageIndex === index);

    if (!instruction || instruction.replacements.length === 0) {
      const [copiedPage] = await nextPdf.copyPages(sourcePdf, [index]);
      nextPdf.addPage(copiedPage);
      continue;
    }

    if (instruction.renderMode === "preserve") {
      const [copiedPage] = await nextPdf.copyPages(sourcePdf, [index]);
      nextPdf.addPage(copiedPage);
      const addedPage = nextPdf.getPage(nextPdf.getPageCount() - 1);
      applyPdfReplacementRegions(addedPage, instruction.replacements, helvetica);
      continue;
    }

    const page = await pdfForRendering.getPage(index + 1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = require2dContext(canvas);
    await page.render({
      canvasContext: context,
      viewport
    }).promise;
    applyReplacementRegions(
      context,
      instruction.replacements.map((replacement) => ({
        ...replacement,
        left: replacement.left * 2,
        top: replacement.top * 2,
        width: replacement.width * 2,
        height: replacement.height * 2
      })),
      canvas.height
    );

    const pngBytes = await canvasToBytes(canvas, "image/png");
    const embedded = await nextPdf.embedPng(pngBytes);
    const pageSize = page.getViewport({ scale: 1 });
    const nextPage = nextPdf.addPage([pageSize.width, pageSize.height]);
    nextPage.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageSize.width,
      height: pageSize.height
    });
  }

  const saved = await nextPdf.save();
  return URL.createObjectURL(new Blob([saved], { type: "application/pdf" }));
}

async function scanOfficeArtifact(bytes: ArrayBuffer, extension: OfficeExtension): Promise<OfficeArtifactScanResult> {
  const zip = await JSZip.loadAsync(bytes);
  const tokens = new Set<string>();

  for (const entry of getOfficeXmlEntries(zip, extension)) {
    const xml = await entry.async("string");
    for (const token of scanOfficeXml(xml, extension).tokens) {
      tokens.add(token);
    }
  }

  for (const entry of getOfficeImageEntries(zip)) {
    const imageBytes = await entry.async("arraybuffer");
    const contentType = inferImageContentType(entry.name);
    if (!contentType) {
      continue;
    }

    const result = await scanImageArtifact(imageBytes, contentType);
    for (const match of result.matches) {
      tokens.add(match.token);
    }
  }

  return {
    tokens: [...tokens]
  };
}

async function rewriteOfficeArtifact(
  bytes: ArrayBuffer,
  extension: OfficeExtension,
  mappings: Record<string, string>
): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);

  for (const entry of getOfficeXmlEntries(zip, extension)) {
    const xml = await entry.async("string");
    const rewritten = rewriteOfficeXml(xml, extension, mappings);
    zip.file(entry.name, rewritten.xml);
  }

  for (const entry of getOfficeImageEntries(zip)) {
    const imageBytes = await entry.async("arraybuffer");
    const contentType = inferImageContentType(entry.name);
    if (!contentType) {
      continue;
    }

    const scanned = await scanImageArtifact(imageBytes, contentType);
    const replacements = scanned.matches
      .map((match) => {
        const replacement = mappings[match.token];
        if (!replacement) {
          return null;
        }

        return {
          token: match.token,
          replacement,
          left: match.left,
          top: match.top,
          width: match.width,
          height: match.height
        };
      })
      .filter((item): item is ReplacementRegion => item !== null);

    if (replacements.length === 0) {
      continue;
    }

    const blob = await rewriteImageArtifactToBlob(imageBytes, contentType, replacements);
    zip.file(entry.name, await blob.arrayBuffer());
  }

  const rebuiltBytes = await zip.generateAsync({ type: "uint8array" });
  return URL.createObjectURL(new Blob([rebuiltBytes], { type: getOfficeContentType(extension) }));
}

async function detectTokenRegions(source: CanvasImageSource, scale: number): Promise<SurfaceTokenRegion[]> {
  const detectorCtor = (globalThis as typeof globalThis & { TextDetector?: TextDetectorConstructor }).TextDetector;
  if (detectorCtor) {
    try {
      return await detectTokenRegionsWithTextDetector(source, scale, detectorCtor);
    } catch (error) {
      console.warn("[detokenizer] native TextDetector failed, falling back to Tesseract OCR", error);
    }
  }

  return detectTokenRegionsWithTesseract(source, scale);
}

async function detectTokenRegionsWithTextDetector(
  source: CanvasImageSource,
  scale: number,
  detectorCtor: TextDetectorConstructor
): Promise<SurfaceTokenRegion[]> {
  const detector = new detectorCtor();
  const detections = await detector.detect(source);
  const matches: SurfaceTokenRegion[] = [];

  for (const detection of detections) {
    const rawValue = detection.rawValue?.trim();
    const bounds = detection.boundingBox;
    if (!rawValue || !bounds) {
      continue;
    }

    const ranges = findApprovedTokenRanges(rawValue);
    for (const range of ranges) {
      const totalChars = Math.max(rawValue.length, 1);
      matches.push({
        token: range.token,
        left: (bounds.x + (bounds.width * range.start) / totalChars) * scale,
        top: bounds.y * scale,
        width: (bounds.width * (range.end - range.start)) / totalChars * scale,
        height: bounds.height * scale
      });
    }
  }

  return matches;
}

async function detectTokenRegionsWithTesseract(source: CanvasImageSource, scale: number): Promise<SurfaceTokenRegion[]> {
  const worker = await getTesseractWorker();
  const { canvas, coordinateScale } = prepareCanvasForTesseract(source, scale);
  const {
    data: { blocks }
  } = await worker.recognize(canvas, {}, { blocks: true });

  return collectMatchesFromOcrCandidates(collectTesseractCandidates(blocks), coordinateScale);
}

async function getTesseractWorker(): Promise<TesseractWorker> {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = createWorker("eng", 1, {
      workerPath: TESSERACT_WORKER_PATH,
      corePath: TESSERACT_CORE_PATH,
      langPath: TESSERACT_LANG_PATH,
      workerBlobURL: false,
      cacheMethod: "readOnly",
      gzip: true
    })
      .then(async (worker) => {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          tessedit_char_whitelist: TESSERACT_WHITELIST,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300"
        });
        return worker;
      })
      .catch((error) => {
        tesseractWorkerPromise = null;
        throw error;
      });
  }

  return tesseractWorkerPromise;
}

function prepareCanvasForTesseract(
  source: CanvasImageSource,
  scale: number
): { canvas: HTMLCanvasElement; coordinateScale: number } {
  const baseCanvas = drawCanvasImageSourceToCanvas(source);
  const canvas = createCanvas(baseCanvas.width * TESSERACT_UPSCALE_FACTOR, baseCanvas.height * TESSERACT_UPSCALE_FACTOR);
  const context = require2dContext(canvas);
  context.imageSmoothingEnabled = true;
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(baseCanvas, 0, 0, canvas.width, canvas.height);

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    const luminance = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
    const nextValue = luminance > 205 ? 255 : 0;
    data[index] = nextValue;
    data[index + 1] = nextValue;
    data[index + 2] = nextValue;
    data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  return {
    canvas,
    coordinateScale: scale / TESSERACT_UPSCALE_FACTOR
  };
}

function drawCanvasImageSourceToCanvas(source: CanvasImageSource): HTMLCanvasElement {
  if (source instanceof HTMLCanvasElement) {
    return source;
  }

  const size = getCanvasImageSourceSize(source);
  const canvas = createCanvas(size.width, size.height);
  const context = require2dContext(canvas);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function getCanvasImageSourceSize(source: CanvasImageSource): { width: number; height: number } {
  if (source instanceof ImageBitmap) {
    return {
      width: source.width,
      height: source.height
    };
  }

  if (source instanceof HTMLCanvasElement) {
    return {
      width: source.width,
      height: source.height
    };
  }

  if (source instanceof OffscreenCanvas) {
    return {
      width: source.width,
      height: source.height
    };
  }

  if (source instanceof HTMLImageElement || source instanceof SVGImageElement || source instanceof HTMLVideoElement) {
    return {
      width: source.width,
      height: source.height
    };
  }

  throw new Error("unsupported_canvas_image_source");
}

function collectTesseractCandidates(blocks: unknown): OcrTextCandidate[] {
  if (!Array.isArray(blocks)) {
    return [];
  }

  const candidates: OcrTextCandidate[] = [];
  for (const block of blocks) {
    if (!isOcrBlock(block)) {
      continue;
    }

    for (const paragraph of block.paragraphs) {
      if (!isOcrParagraph(paragraph)) {
        continue;
      }

      for (const line of paragraph.lines) {
        if (!isOcrLine(line)) {
          continue;
        }

        candidates.push({
          rawValue: line.text.trim(),
          bbox: toBox(line.bbox)
        });
      }
    }
  }

  return candidates;
}

function collectMatchesFromOcrCandidates(candidates: OcrTextCandidate[], scale: number): SurfaceTokenRegion[] {
  const matches: SurfaceTokenRegion[] = [];

  for (const candidate of candidates) {
    const ranges = findApprovedTokenRangesForOcr(candidate.rawValue);
    for (const range of ranges) {
      const totalChars = Math.max(candidate.rawValue.length, 1);
      matches.push({
        token: range.token,
        left: (candidate.bbox.x + (candidate.bbox.width * range.start) / totalChars) * scale,
        top: candidate.bbox.y * scale,
        width: (candidate.bbox.width * (range.end - range.start)) / totalChars * scale,
        height: candidate.bbox.height * scale
      });
    }
  }

  return dedupeSurfaceTokenRegions(matches);
}

function findApprovedTokenRangesForOcr(content: string): Array<{ token: string; start: number; end: number }> {
  const exactRanges = findApprovedTokenRanges(content);
  if (exactRanges.length > 0) {
    return exactRanges;
  }

  const normalized = normalizeOcrContent(content);
  if (normalized.content.length === 0) {
    return [];
  }

  const haystack = normalized.content.toLowerCase();
  const matches: Array<{ token: string; start: number; end: number }> = [];

  for (const token of APPROVED_TOKENS) {
    const needle = token.toLowerCase();
    let searchIndex = 0;
    while (searchIndex < haystack.length) {
      const matchIndex = haystack.indexOf(needle, searchIndex);
      if (matchIndex === -1) {
        break;
      }

      const start = normalized.originalIndexes[matchIndex];
      const lastIndex = normalized.originalIndexes[matchIndex + needle.length - 1];
      if (start !== undefined && lastIndex !== undefined) {
        matches.push({
          token,
          start,
          end: lastIndex + 1
        });
      }

      searchIndex = matchIndex + needle.length;
    }
  }

  return matches;
}

function normalizeOcrContent(content: string): { content: string; originalIndexes: number[] } {
  const characters: string[] = [];
  const originalIndexes: number[] = [];

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (/\s/.test(character)) {
      continue;
    }

    characters.push(character);
    originalIndexes.push(index);
  }

  return {
    content: characters.join(""),
    originalIndexes
  };
}

function dedupeSurfaceTokenRegions(matches: SurfaceTokenRegion[]): SurfaceTokenRegion[] {
  const seen = new Set<string>();
  const unique: SurfaceTokenRegion[] = [];

  for (const match of matches) {
    const key = [
      match.token,
      Math.round(match.left),
      Math.round(match.top),
      Math.round(match.width),
      Math.round(match.height)
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(match);
  }

  return unique;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOcrBlock(value: unknown): value is { paragraphs: unknown[] } {
  return isRecord(value) && Array.isArray(value.paragraphs);
}

function isOcrParagraph(value: unknown): value is { lines: unknown[] } {
  return isRecord(value) && Array.isArray(value.lines);
}

function isOcrLine(value: unknown): value is { text: string; bbox: Record<string, unknown> } {
  return isRecord(value) && typeof value.text === "string" && isRecord(value.bbox);
}

function toBox(bbox: Record<string, unknown>): { x: number; y: number; width: number; height: number } {
  const x0 = typeof bbox.x0 === "number" ? bbox.x0 : 0;
  const y0 = typeof bbox.y0 === "number" ? bbox.y0 : 0;
  const x1 = typeof bbox.x1 === "number" ? bbox.x1 : x0;
  const y1 = typeof bbox.y1 === "number" ? bbox.y1 : y0;

  return {
    x: x0,
    y: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0)
  };
}

function drawBitmapToCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = createCanvas(bitmap.width, bitmap.height);
  const context = require2dContext(canvas);
  context.drawImage(bitmap, 0, 0);
  return canvas;
}

function cropCanvasRegion(
  canvas: HTMLCanvasElement,
  left: number,
  top: number,
  width: number,
  height: number
): HTMLCanvasElement {
  const nextCanvas = createCanvas(width, height);
  const context = require2dContext(nextCanvas);
  context.drawImage(canvas, left, top, width, height, 0, 0, width, height);
  return nextCanvas;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function require2dContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas_2d_unavailable");
  }

  return context;
}

async function loadImageBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function canvasToBlob(canvas: HTMLCanvasElement, contentType: string): Promise<Blob> {
  const normalizedType = contentType === "image/jpg" ? "image/jpeg" : contentType;
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("canvas_blob_unavailable"));
        return;
      }

      resolve(blob);
    }, normalizedType);
  });
}

async function canvasToBytes(canvas: HTMLCanvasElement, contentType: string): Promise<Uint8Array> {
  const blob = await canvasToBlob(canvas, contentType);
  return new Uint8Array(await blob.arrayBuffer());
}

function applyReplacementRegions(
  context: CanvasRenderingContext2D,
  replacements: ReplacementRegion[],
  canvasHeight: number
): void {
  for (const replacement of replacements) {
    context.fillStyle = "white";
    context.fillRect(replacement.left, replacement.top, replacement.width, replacement.height);
    context.fillStyle = "black";
    context.textBaseline = "top";
    context.font = `${Math.max(12, replacement.height * 0.75)}px sans-serif`;
    context.fillText(replacement.replacement, replacement.left, replacement.top, replacement.width);
  }

  void canvasHeight;
}

function applyPdfReplacementRegions(
  page: import("pdf-lib").PDFPage,
  replacements: ReplacementRegion[],
  font: import("pdf-lib").PDFFont
): void {
  const pageHeight = page.getHeight();
  for (const replacement of replacements) {
    page.drawRectangle({
      x: replacement.left,
      y: pageHeight - replacement.top - replacement.height,
      width: replacement.width,
      height: replacement.height,
      color: rgb(1, 1, 1)
    });
    page.drawText(replacement.replacement, {
      x: replacement.left,
      y: pageHeight - replacement.top - replacement.height + Math.max(1, replacement.height * 0.15),
      size: Math.max(8, replacement.height * 0.8),
      font,
      color: rgb(0, 0, 0),
      maxWidth: replacement.width
    });
  }
}

function getOfficeXmlEntries(zip: JSZip, extension: OfficeExtension): JSZip.JSZipObject[] {
  const prefix = extension === "docx" ? "word/" : extension === "xlsx" ? "xl/" : "ppt/";
  return Object.values(zip.files).filter((entry) => !entry.dir && entry.name.startsWith(prefix) && entry.name.endsWith(".xml"));
}

function getOfficeImageEntries(zip: JSZip): JSZip.JSZipObject[] {
  return Object.values(zip.files).filter(
    (entry) => !entry.dir && /\/media\//i.test(entry.name) && /\.(png|jpe?g|webp)$/i.test(entry.name)
  );
}

function inferImageContentType(name: string): string | null {
  if (/\.png$/i.test(name)) {
    return "image/png";
  }
  if (/\.jpe?g$/i.test(name)) {
    return "image/jpeg";
  }
  if (/\.webp$/i.test(name)) {
    return "image/webp";
  }
  return null;
}

function getOfficeContentType(extension: OfficeExtension): string {
  switch (extension) {
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
}
