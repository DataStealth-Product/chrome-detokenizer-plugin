import type { ReplacementRegion, VisualSurfaceDescriptor } from "../shared/contracts";
import {
  OffscreenMessageType,
  type ImageArtifactScanResult,
  type OfficeArtifactScanResult,
  type OffscreenRequest,
  type PdfArtifactScanResult,
  type PdfPageRewriteInstruction,
  type SurfaceScanResult
} from "../offscreen/messages";

const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

export class OffscreenClient {
  async scanVisualSurfaces(
    screenshotDataUrl: string,
    surfaces: VisualSurfaceDescriptor[],
    devicePixelRatio: number
  ): Promise<SurfaceScanResult[]> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.SCAN_VISUAL_SURFACES,
      payload: {
        screenshotDataUrl,
        surfaces,
        devicePixelRatio
      }
    });

    return (response as { surfaces: SurfaceScanResult[] }).surfaces;
  }

  async scanImageArtifact(bytes: ArrayBuffer, contentType: string): Promise<ImageArtifactScanResult> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.SCAN_IMAGE_ARTIFACT,
      payload: {
        bytes,
        contentType
      }
    });

    return (response as { result: ImageArtifactScanResult }).result;
  }

  async rewriteImageArtifact(bytes: ArrayBuffer, contentType: string, replacements: ReplacementRegion[]): Promise<string> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.REWRITE_IMAGE_ARTIFACT,
      payload: {
        bytes,
        contentType,
        replacements
      }
    });

    return (response as { objectUrl: string }).objectUrl;
  }

  async scanPdfArtifact(bytes: ArrayBuffer): Promise<PdfArtifactScanResult> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.SCAN_PDF_ARTIFACT,
      payload: { bytes }
    });

    return (response as { result: PdfArtifactScanResult }).result;
  }

  async rewritePdfArtifact(bytes: ArrayBuffer, pages: PdfPageRewriteInstruction[]): Promise<string> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.REWRITE_PDF_ARTIFACT,
      payload: { bytes, pages }
    });

    return (response as { objectUrl: string }).objectUrl;
  }

  async scanOfficeArtifact(bytes: ArrayBuffer, extension: "docx" | "xlsx" | "pptx"): Promise<OfficeArtifactScanResult> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.SCAN_OFFICE_ARTIFACT,
      payload: { bytes, extension }
    });

    return (response as { result: OfficeArtifactScanResult }).result;
  }

  async rewriteOfficeArtifact(
    bytes: ArrayBuffer,
    extension: "docx" | "xlsx" | "pptx",
    mappings: Record<string, string>
  ): Promise<string> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.REWRITE_OFFICE_ARTIFACT,
      payload: { bytes, extension, mappings }
    });

    return (response as { objectUrl: string }).objectUrl;
  }

  async revokeObjectUrl(objectUrl: string): Promise<void> {
    await this.sendMessage({
      type: OffscreenMessageType.REVOKE_OBJECT_URL,
      payload: { objectUrl }
    });
  }

  private async sendMessage(message: OffscreenRequest): Promise<unknown> {
    await this.ensureDocument();
    return chrome.runtime.sendMessage(message);
  }

  private async ensureDocument(): Promise<void> {
    const offscreenApi = (chrome as typeof chrome & {
      offscreen?: {
        hasDocument?: () => Promise<boolean>;
        createDocument: (options: {
          url: string;
          reasons: string[];
          justification: string;
        }) => Promise<void>;
      };
    }).offscreen;

    if (!offscreenApi?.createDocument) {
      throw new Error("offscreen_api_unavailable");
    }

    const hasDocument = offscreenApi.hasDocument ? await offscreenApi.hasDocument() : false;
    if (hasDocument) {
      return;
    }

    await offscreenApi.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ["DOM_PARSER", "BLOBS"],
      justification: "Local OCR, PDF parsing, and transient detokenized file generation"
    });
  }
}
