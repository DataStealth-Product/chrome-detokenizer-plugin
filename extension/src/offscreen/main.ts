import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import { findApprovedTokenRanges } from "../shared/tokenMatching";
import type { ReplacementRegion } from "../shared/contracts";
import {
  OffscreenMessageType,
  type ImageArtifactScanResult,
  type OffscreenRequest,
  type PdfArtifactScanResult,
  type PdfPageRewriteInstruction,
  type PdfPageScanResult,
  type SurfaceScanResult,
  type SurfaceTokenRegion
} from "./messages";

interface TextDetectionResult {
  rawValue?: string;
  boundingBox?: DOMRectReadOnly;
}

interface TextDetectorConstructor {
  new (): {
    detect: (source: CanvasImageSource) => Promise<TextDetectionResult[]>;
  };
}

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) {
    return false;
  }

  const request = message as OffscreenRequest;
  void (async () => {
    switch (request.type) {
      case OffscreenMessageType.SCAN_VISUAL_SURFACES:
        sendResponse({
          surfaces: await scanVisualSurfaces(
            request.payload.screenshotDataUrl,
            request.payload.surfaces,
            request.payload.devicePixelRatio
          )
        });
        return;
      case OffscreenMessageType.SCAN_IMAGE_ARTIFACT:
        sendResponse({
          result: await scanImageArtifact(request.payload.bytes, request.payload.contentType)
        });
        return;
      case OffscreenMessageType.REWRITE_IMAGE_ARTIFACT:
        sendResponse({
          objectUrl: await rewriteImageArtifact(
            request.payload.bytes,
            request.payload.contentType,
            request.payload.replacements
          ),
          contentType: request.payload.contentType
        });
        return;
      case OffscreenMessageType.SCAN_PDF_ARTIFACT:
        sendResponse({
          result: await scanPdfArtifact(request.payload.bytes)
        });
        return;
      case OffscreenMessageType.REWRITE_PDF_ARTIFACT:
        sendResponse({
          objectUrl: await rewritePdfArtifact(request.payload.bytes, request.payload.pages),
          contentType: "application/pdf"
        });
        return;
      case OffscreenMessageType.REVOKE_OBJECT_URL:
        URL.revokeObjectURL(request.payload.objectUrl);
        sendResponse({ ok: true });
        return;
      default:
        sendResponse({ error: "unsupported_offscreen_message" });
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
  const bitmap = await loadImageBitmap(new Blob([bytes], { type: contentType }));
  const canvas = drawBitmapToCanvas(bitmap);
  const context = require2dContext(canvas);

  applyReplacementRegions(context, replacements, canvas.height);

  const blob = await canvasToBlob(canvas, contentType);
  return URL.createObjectURL(blob);
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

async function detectTokenRegions(source: CanvasImageSource, scale: number): Promise<SurfaceTokenRegion[]> {
  const detectorCtor = (globalThis as typeof globalThis & { TextDetector?: TextDetectorConstructor }).TextDetector;
  if (!detectorCtor) {
    throw new Error("text_detector_unavailable");
  }

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
