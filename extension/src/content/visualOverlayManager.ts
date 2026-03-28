import type { ReplacementRegion, VisualOverlay } from "../shared/contracts";

interface SurfaceBinding {
  element: Element;
  regions: ReplacementRegion[];
}

export class VisualOverlayManager {
  private readonly root: HTMLDivElement;
  private readonly bindings = new Map<string, SurfaceBinding>();
  private ttlTimer: number | undefined;

  constructor(private readonly ttlMs: number) {
    this.root = document.createElement("div");
    this.root.setAttribute("data-detokenizer-overlay-root", "true");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      pointerEvents: "none",
      zIndex: "2147483647"
    });

    window.addEventListener("scroll", () => this.render(), true);
    window.addEventListener("resize", () => this.render(), true);
  }

  apply(overlays: VisualOverlay[], elementBySurfaceId: Map<string, Element>): void {
    this.ensureRoot();

    for (const [surfaceId, element] of elementBySurfaceId) {
      const existing = this.bindings.get(surfaceId);
      if (!existing) {
        continue;
      }

      this.bindings.set(surfaceId, {
        element,
        regions: existing.regions
      });
    }

    for (const overlay of overlays) {
      const element = elementBySurfaceId.get(overlay.surfaceId);
      if (!element || overlay.replacementRegions.length === 0) {
        continue;
      }

      this.bindings.set(overlay.surfaceId, {
        element,
        regions: overlay.replacementRegions
      });
    }

    for (const [surfaceId, binding] of [...this.bindings.entries()]) {
      if (!binding.element.isConnected) {
        this.bindings.delete(surfaceId);
      }
    }

    this.render();
    this.resetTtl();
  }

  clear(): void {
    this.bindings.clear();
    this.root.replaceChildren();
    if (this.ttlTimer !== undefined) {
      window.clearTimeout(this.ttlTimer);
      this.ttlTimer = undefined;
    }
  }

  private ensureRoot(): void {
    if (!this.root.isConnected) {
      document.documentElement.append(this.root);
    }
  }

  private render(): void {
    this.ensureRoot();
    this.root.replaceChildren();

    for (const binding of this.bindings.values()) {
      const rect = binding.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      for (const region of binding.regions) {
        const node = document.createElement("div");
        node.textContent = region.replacement;
        Object.assign(node.style, {
          position: "fixed",
          left: `${rect.left + region.left}px`,
          top: `${rect.top + region.top}px`,
          width: `${region.width}px`,
          minHeight: `${region.height}px`,
          padding: "0 2px",
          background: "#ffffff",
          color: "#111111",
          fontSize: `${Math.max(12, region.height * 0.8)}px`,
          lineHeight: `${Math.max(region.height, 16)}px`,
          whiteSpace: "nowrap",
          overflow: "hidden"
        });
        this.root.append(node);
      }
    }
  }

  private resetTtl(): void {
    if (this.ttlTimer !== undefined) {
      window.clearTimeout(this.ttlTimer);
    }

    this.ttlTimer = window.setTimeout(() => this.clear(), this.ttlMs);
  }
}
