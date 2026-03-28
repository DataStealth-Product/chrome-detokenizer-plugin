import type { ReplacementRegion, VisualSurfaceDescriptor } from "../shared/contracts";

export const OffscreenMessageType = {
  SCAN_VISUAL_SURFACES: "OFFSCREEN_SCAN_VISUAL_SURFACES",
  SCAN_IMAGE_ARTIFACT: "OFFSCREEN_SCAN_IMAGE_ARTIFACT",
  REWRITE_IMAGE_ARTIFACT: "OFFSCREEN_REWRITE_IMAGE_ARTIFACT",
  SCAN_PDF_ARTIFACT: "OFFSCREEN_SCAN_PDF_ARTIFACT",
  REWRITE_PDF_ARTIFACT: "OFFSCREEN_REWRITE_PDF_ARTIFACT",
  REVOKE_OBJECT_URL: "OFFSCREEN_REVOKE_OBJECT_URL"
} as const;

export interface SurfaceTokenRegion {
  token: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SurfaceScanResult {
  surfaceId: string;
  matches: SurfaceTokenRegion[];
}

export interface ImageArtifactScanResult {
  width: number;
  height: number;
  matches: SurfaceTokenRegion[];
}

export interface PdfPageTextMatch {
  token: string;
  left: number;
  top: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

export interface PdfPageScanResult {
  pageIndex: number;
  renderMode: "preserve" | "flatten";
  textMatches: PdfPageTextMatch[];
}

export interface PdfArtifactScanResult {
  pageCount: number;
  pages: PdfPageScanResult[];
}

export interface OffscreenScanVisualSurfacesRequest {
  type: typeof OffscreenMessageType.SCAN_VISUAL_SURFACES;
  payload: {
    screenshotDataUrl: string;
    surfaces: VisualSurfaceDescriptor[];
    devicePixelRatio: number;
  };
}

export interface OffscreenScanVisualSurfacesResponse {
  surfaces: SurfaceScanResult[];
}

export interface OffscreenScanImageArtifactRequest {
  type: typeof OffscreenMessageType.SCAN_IMAGE_ARTIFACT;
  payload: {
    bytes: ArrayBuffer;
    contentType: string;
  };
}

export interface OffscreenScanImageArtifactResponse {
  result: ImageArtifactScanResult;
}

export interface OffscreenRewriteImageArtifactRequest {
  type: typeof OffscreenMessageType.REWRITE_IMAGE_ARTIFACT;
  payload: {
    bytes: ArrayBuffer;
    contentType: string;
    replacements: ReplacementRegion[];
  };
}

export interface OffscreenRewriteImageArtifactResponse {
  objectUrl: string;
  contentType: string;
}

export interface OffscreenScanPdfArtifactRequest {
  type: typeof OffscreenMessageType.SCAN_PDF_ARTIFACT;
  payload: {
    bytes: ArrayBuffer;
  };
}

export interface OffscreenScanPdfArtifactResponse {
  result: PdfArtifactScanResult;
}

export interface PdfPageRewriteInstruction {
  pageIndex: number;
  renderMode: "preserve" | "flatten";
  replacements: ReplacementRegion[];
}

export interface OffscreenRewritePdfArtifactRequest {
  type: typeof OffscreenMessageType.REWRITE_PDF_ARTIFACT;
  payload: {
    bytes: ArrayBuffer;
    pages: PdfPageRewriteInstruction[];
  };
}

export interface OffscreenRewritePdfArtifactResponse {
  objectUrl: string;
  contentType: string;
}

export interface OffscreenRevokeObjectUrlRequest {
  type: typeof OffscreenMessageType.REVOKE_OBJECT_URL;
  payload: {
    objectUrl: string;
  };
}

export type OffscreenRequest =
  | OffscreenScanVisualSurfacesRequest
  | OffscreenScanImageArtifactRequest
  | OffscreenRewriteImageArtifactRequest
  | OffscreenScanPdfArtifactRequest
  | OffscreenRewritePdfArtifactRequest
  | OffscreenRevokeObjectUrlRequest;
