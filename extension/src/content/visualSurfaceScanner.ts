import type { SurfaceKind, VisualSurfaceDescriptor } from "../shared/contracts";

export interface SurfaceScanBatch {
  descriptors: VisualSurfaceDescriptor[];
  elementBySurfaceId: Map<string, Element>;
}

export class VisualSurfaceScanner {
  scan(maxCount: number = 6): SurfaceScanBatch {
    const descriptors: VisualSurfaceDescriptor[] = [];
    const elementBySurfaceId = new Map<string, Element>();
    const elements = [...document.querySelectorAll("img, canvas")];

    for (const element of elements) {
      if (descriptors.length >= maxCount) {
        break;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20) {
        continue;
      }

      if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) {
        continue;
      }

      const id = getOrCreateSurfaceId(element);
      descriptors.push({
        id,
        kind: inferSurfaceKind(element),
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      });
      elementBySurfaceId.set(id, element);
    }

    return {
      descriptors,
      elementBySurfaceId
    };
  }
}

function inferSurfaceKind(element: Element): SurfaceKind {
  if (element instanceof HTMLCanvasElement && element.closest("[data-page-number], .page, .textLayer")) {
    return "pdf";
  }

  return element instanceof HTMLCanvasElement ? "canvas" : "image";
}

function getOrCreateSurfaceId(element: Element): string {
  const existing = element.getAttribute("data-detokenizer-surface-id");
  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  element.setAttribute("data-detokenizer-surface-id", created);
  return created;
}
