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

    const parsed = response as { surfaces?: SurfaceScanResult[]; error?: string };
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    if (!Array.isArray(parsed.surfaces)) {
      throw new Error("invalid_offscreen_visual_scan_response");
    }

    return parsed.surfaces;
  }

  async scanImageArtifact(bytes: ArrayBuffer, contentType: string): Promise<ImageArtifactScanResult> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.SCAN_IMAGE_ARTIFACT,
      payload: {
        bytes,
        contentType
      }
    });

    const parsed = response as { result?: ImageArtifactScanResult; error?: string };
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    if (!parsed.result) {
      throw new Error("invalid_offscreen_image_scan_response");
    }

    return parsed.result;
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

    const parsed = response as { objectUrl?: string; error?: string };
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    if (!parsed.objectUrl) {
      throw new Error("invalid_offscreen_image_rewrite_response");
    }

    return parsed.objectUrl;
  }

  async scanPdfArtifact(bytes: ArrayBuffer): Promise<PdfArtifactScanResult> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.SCAN_PDF_ARTIFACT,
      payload: { bytes }
    });

    const parsed = response as { result?: PdfArtifactScanResult; error?: string };
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    if (!parsed.result) {
      throw new Error("invalid_offscreen_pdf_scan_response");
    }

    return parsed.result;
  }

  async rewritePdfArtifact(bytes: ArrayBuffer, pages: PdfPageRewriteInstruction[]): Promise<string> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.REWRITE_PDF_ARTIFACT,
      payload: { bytes, pages }
    });

    const parsed = response as { objectUrl?: string; error?: string };
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    if (!parsed.objectUrl) {
      throw new Error("invalid_offscreen_pdf_rewrite_response");
    }

    return parsed.objectUrl;
  }

  async scanOfficeArtifact(bytes: ArrayBuffer, extension: "docx" | "xlsx" | "pptx"): Promise<OfficeArtifactScanResult> {
    const response = await this.sendMessage({
      type: OffscreenMessageType.SCAN_OFFICE_ARTIFACT,
      payload: { bytes, extension }
    });

    const parsed = response as { result?: OfficeArtifactScanResult; error?: string };
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    if (!parsed.result) {
      throw new Error("invalid_offscreen_office_scan_response");
    }

    return parsed.result;
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

    const parsed = response as { objectUrl?: string; error?: string };
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    if (!parsed.objectUrl) {
      throw new Error("invalid_offscreen_office_rewrite_response");
    }

    return parsed.objectUrl;
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
