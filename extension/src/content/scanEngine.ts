import { TOKEN_HINT_PREFIX } from "../shared/config";
import type { TokenOccurrence } from "../shared/contracts";
import { collectMatchRanges, type TokenPatternProvider } from "./tokenPatternProvider";
import type { ResolvedDetectionResult, ResolvedOccurrence, TextSegment } from "./types";

export class ScanEngine {
  private readonly snapshotsByNode = new WeakMap<Node, Map<string, string>>();

  constructor(private readonly patternProvider: TokenPatternProvider) {}

  scanRoots(rawRoots: Node[]): ResolvedDetectionResult {
    const roots = this.normalizeRoots(rawRoots);
    const tokens = new Set<string>();
    const occurrences: ResolvedOccurrence[] = [];
    const visitedContainers = new WeakSet<Node>();

    for (const root of roots) {
      this.scanNode(root, visitedContainers, tokens, occurrences);
    }

    return {
      tokens: [...tokens],
      occurrences
    };
  }

  toPublicOccurrences(occurrences: ResolvedOccurrence[]): TokenOccurrence[] {
    return occurrences.map((occurrence) => ({
      token: occurrence.token,
      targetType: occurrence.targetType,
      nodePath: occurrence.nodePath,
      startOffset: occurrence.startOffset,
      endOffset: occurrence.endOffset,
      ...(occurrence.targetType === "attribute" ? { attributeName: occurrence.attributeName } : {})
    }));
  }

  private normalizeRoots(rawRoots: Node[]): Node[] {
    const roots = new Set<Node>();

    for (const candidate of rawRoots) {
      if (isTextNode(candidate) && candidate.parentNode) {
        roots.add(candidate.parentNode);
      } else {
        roots.add(candidate);
      }
    }

    return [...roots].filter((root) => this.isProcessableRoot(root));
  }

  private isProcessableRoot(node: Node): boolean {
    if (isDocumentNode(node) || isElementNode(node) || isDocumentFragmentNode(node)) {
      return true;
    }

    return false;
  }

  private scanNode(
    node: Node,
    visitedContainers: WeakSet<Node>,
    tokens: Set<string>,
    occurrences: ResolvedOccurrence[]
  ): void {
    if (isDocumentNode(node)) {
      this.scanContainer(node, visitedContainers, tokens, occurrences);
      return;
    }

    if (isElementNode(node) || isDocumentFragmentNode(node)) {
      this.scanContainer(node, visitedContainers, tokens, occurrences);
    }
  }

  private scanContainer(
    container: Document | Element | ShadowRoot | DocumentFragment,
    visitedContainers: WeakSet<Node>,
    tokens: Set<string>,
    occurrences: ResolvedOccurrence[]
  ): void {
    if (visitedContainers.has(container)) {
      return;
    }

    visitedContainers.add(container);

    if (isElementNode(container)) {
      if (isExcludedElement(container)) {
        return;
      }

      this.scanVisibleAttributes(container, tokens, occurrences);
      this.scanEditableElement(container, tokens, occurrences);
      if (container.shadowRoot) {
        this.scanContainer(container.shadowRoot, visitedContainers, tokens, occurrences);
      }
    }

    const childNodes = Array.from(container.childNodes);
    this.scanAdjacentTextNodeSequences(childNodes, tokens, occurrences);

    for (const child of childNodes) {
      if (isElementNode(child) || isDocumentFragmentNode(child)) {
        this.scanContainer(child, visitedContainers, tokens, occurrences);
      }
    }
  }

  private scanEditableElement(element: Element, tokens: Set<string>, occurrences: ResolvedOccurrence[]): void {
    if (isInputElement(element)) {
      if (element.type.toLowerCase() === "password") {
        return;
      }

      this.scanFormControlValue(element, "input", tokens, occurrences);
      return;
    }

    if (isTextAreaElement(element)) {
      this.scanFormControlValue(element, "textarea", tokens, occurrences);
    }
  }

  private scanFormControlValue(
    element: HTMLInputElement | HTMLTextAreaElement,
    targetType: "input" | "textarea",
    tokens: Set<string>,
    occurrences: ResolvedOccurrence[]
  ): void {
    const value = element.value;
    const surfaceKey = `${targetType}-value`;
    if (this.shouldSkipSurface(element, surfaceKey, value)) {
      return;
    }

    if (!value.includes(TOKEN_HINT_PREFIX)) {
      this.trackSurfaceSnapshot(element, surfaceKey, value);
      return;
    }

    const ranges = collectMatchRanges(value, this.patternProvider);
    for (const range of ranges) {
      tokens.add(range.token);
      occurrences.push({
        token: range.token,
        targetType,
        nodePath: getNodePath(element),
        startOffset: range.start,
        endOffset: range.end,
        element
      });
    }

    this.trackSurfaceSnapshot(element, surfaceKey, value);
  }

  private scanVisibleAttributes(element: Element, tokens: Set<string>, occurrences: ResolvedOccurrence[]): void {
    for (const attributeName of VISIBLE_TEXT_ATTRIBUTE_NAMES) {
      const value = element.getAttribute(attributeName);
      if (value === null) {
        continue;
      }

      const surfaceKey = `attribute:${attributeName}`;
      if (this.shouldSkipSurface(element, surfaceKey, value)) {
        continue;
      }

      if (!value.includes(TOKEN_HINT_PREFIX)) {
        this.trackSurfaceSnapshot(element, surfaceKey, value);
        continue;
      }

      const ranges = collectMatchRanges(value, this.patternProvider);
      for (const range of ranges) {
        tokens.add(range.token);
        occurrences.push({
          token: range.token,
          targetType: "attribute",
          attributeName,
          nodePath: getNodePath(element),
          startOffset: range.start,
          endOffset: range.end,
          element
        });
      }

      this.trackSurfaceSnapshot(element, surfaceKey, value);
    }
  }

  private scanAdjacentTextNodeSequences(childNodes: Node[], tokens: Set<string>, occurrences: ResolvedOccurrence[]): void {
    let pending: Text[] = [];

    const flush = (): void => {
      if (pending.length > 0) {
        this.scanTextSequence(pending, tokens, occurrences);
      }
      pending = [];
    };

    for (const node of childNodes) {
      if (isTextNode(node)) {
        pending.push(node);
      } else if (isElementNode(node) && isTransparentTextFlowElement(node)) {
        this.collectTransparentTextNodes(node, pending);
      } else {
        flush();
      }
    }

    flush();
  }

  private collectTransparentTextNodes(element: Element, pending: Text[]): void {
    if (isExcludedElement(element) || isInputElement(element) || isTextAreaElement(element) || isIFrameElement(element)) {
      return;
    }

    for (const child of Array.from(element.childNodes)) {
      if (isTextNode(child)) {
        pending.push(child);
      } else if (isElementNode(child) && isTransparentTextFlowElement(child)) {
        this.collectTransparentTextNodes(child, pending);
      }
    }
  }

  private scanTextSequence(textNodes: Text[], tokens: Set<string>, occurrences: ResolvedOccurrence[]): void {
    const combined = textNodes.map((node) => node.data).join("");
    if (this.shouldSkipTextSequence(textNodes, combined)) {
      return;
    }

    if (!combined.includes(TOKEN_HINT_PREFIX)) {
      this.trackTextSequence(textNodes);
      return;
    }

    const ranges = collectMatchRanges(combined, this.patternProvider);
    if (ranges.length === 0) {
      this.trackTextSequence(textNodes);
      return;
    }

    const isEditable = Boolean(textNodes[0]?.parentElement?.closest("[contenteditable]:not([contenteditable='false'])"));
    const targetType = isEditable ? "contenteditable" : "text";

    for (const range of ranges) {
      const segments = this.resolveSegments(textNodes, range.start, range.end);
      if (segments.length === 0) {
        continue;
      }
      const firstSegment = segments[0];
      if (!firstSegment) {
        continue;
      }

      tokens.add(range.token);
      occurrences.push({
        token: range.token,
        targetType,
        nodePath: getNodePath(firstSegment.node),
        startOffset: range.start,
        endOffset: range.end,
        segments
      });
    }

    this.trackTextSequence(textNodes);
  }

  private resolveSegments(textNodes: Text[], start: number, end: number): TextSegment[] {
    const segments: TextSegment[] = [];
    let offset = 0;

    for (const node of textNodes) {
      const nodeStart = offset;
      const nodeEnd = nodeStart + node.data.length;
      const overlapStart = Math.max(start, nodeStart);
      const overlapEnd = Math.min(end, nodeEnd);

      if (overlapStart < overlapEnd) {
        segments.push({
          node,
          start: overlapStart - nodeStart,
          end: overlapEnd - nodeStart
        });
      }

      offset = nodeEnd;
      if (offset >= end) {
        break;
      }
    }

    return segments;
  }

  private shouldSkipTextSequence(textNodes: Text[], combinedValue: string): boolean {
    if (textNodes.length === 0) {
      return true;
    }

    if (!textNodes.every((node) => this.hasSurfaceSnapshot(node, TEXT_SURFACE_KEY))) {
      return false;
    }

    const previous = textNodes.map((node) => this.getSurfaceSnapshot(node, TEXT_SURFACE_KEY) ?? "").join("");
    return previous === combinedValue;
  }

  private shouldSkipSurface(node: Node, surfaceKey: string, currentValue: string): boolean {
    return this.getSurfaceSnapshot(node, surfaceKey) === currentValue;
  }

  private trackTextSequence(textNodes: Text[]): void {
    for (const node of textNodes) {
      this.trackSurfaceSnapshot(node, TEXT_SURFACE_KEY, node.data);
    }
  }

  private trackSurfaceSnapshot(node: Node, surfaceKey: string, value: string): void {
    const snapshots = this.ensureSnapshots(node);
    snapshots.set(surfaceKey, value);
  }

  private hasSurfaceSnapshot(node: Node, surfaceKey: string): boolean {
    return this.snapshotsByNode.get(node)?.has(surfaceKey) ?? false;
  }

  private getSurfaceSnapshot(node: Node, surfaceKey: string): string | undefined {
    return this.snapshotsByNode.get(node)?.get(surfaceKey);
  }

  private ensureSnapshots(node: Node): Map<string, string> {
    const existing = this.snapshotsByNode.get(node);
    if (existing) {
      return existing;
    }

    const created = new Map<string, string>();
    this.snapshotsByNode.set(node, created);
    return created;
  }
}

export function getNodePath(node: Node): string {
  const segments: string[] = [];
  let current: Node | null = node;

  while (current && current.parentNode) {
    const parentNode: Node = current.parentNode;
    const siblings = Array.from(parentNode.childNodes) as Node[];
    const index = siblings.indexOf(current);
    segments.push(String(index));

    if (isShadowRootNode(parentNode)) {
      segments.push("shadow-root");
      current = parentNode.host;
      continue;
    }

    if (isDocumentNode(parentNode)) {
      segments.push("document");
      break;
    }

    current = parentNode;
  }

  return segments.reverse().join("/");
}

const EXCLUDED_CONTAINER_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
const VISIBLE_TEXT_ATTRIBUTE_NAMES = ["placeholder", "title", "alt", "aria-label", "aria-description", "aria-placeholder"] as const;
const TRANSPARENT_TEXT_FLOW_TAGS = new Set([
  "A",
  "ABBR",
  "B",
  "BDI",
  "BDO",
  "CITE",
  "CODE",
  "DATA",
  "DEL",
  "DFN",
  "EM",
  "I",
  "INS",
  "KBD",
  "LABEL",
  "MARK",
  "Q",
  "S",
  "SAMP",
  "SMALL",
  "SPAN",
  "STRONG",
  "SUB",
  "SUP",
  "TIME",
  "U",
  "VAR"
]);
const TEXT_SURFACE_KEY = "text";

function isExcludedElement(element: Element): boolean {
  return EXCLUDED_CONTAINER_TAGS.has(element.tagName);
}

function isTransparentTextFlowElement(element: Element): boolean {
  return TRANSPARENT_TEXT_FLOW_TAGS.has(element.tagName);
}

function isDocumentNode(node: Node | null | undefined): node is Document {
  return node?.nodeType === Node.DOCUMENT_NODE;
}

function isDocumentFragmentNode(node: Node | null | undefined): node is DocumentFragment {
  return node?.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
}

function isShadowRootNode(node: Node | null | undefined): node is ShadowRoot {
  return isDocumentFragmentNode(node) && "host" in node;
}

function isElementNode(node: Node | null | undefined): node is Element {
  return node?.nodeType === Node.ELEMENT_NODE;
}

function isTextNode(node: Node | null | undefined): node is Text {
  return node?.nodeType === Node.TEXT_NODE;
}

function isInputElement(element: Element | null | undefined): element is HTMLInputElement {
  return element?.tagName === "INPUT";
}

function isTextAreaElement(element: Element | null | undefined): element is HTMLTextAreaElement {
  return element?.tagName === "TEXTAREA";
}

function isIFrameElement(element: Element | null | undefined): element is HTMLIFrameElement {
  return element?.tagName === "IFRAME";
}
