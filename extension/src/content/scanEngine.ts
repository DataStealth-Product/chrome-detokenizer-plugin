import { TOKEN_HINT_PREFIX } from "../shared/config";
import type { TokenOccurrence } from "../shared/contracts";
import { collectMatchRanges, type TokenPatternProvider } from "./tokenPatternProvider";
import type { ResolvedDetectionResult, ResolvedOccurrence, TextSegment } from "./types";

export class ScanEngine {
  private readonly snapshotByNode = new WeakMap<Node, string>();
  private readonly processedNodes = new WeakSet<Node>();

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
      endOffset: occurrence.endOffset
    }));
  }

  private normalizeRoots(rawRoots: Node[]): Node[] {
    const roots = new Set<Node>();

    for (const candidate of rawRoots) {
      if (candidate.nodeType === Node.TEXT_NODE && candidate.parentNode) {
        roots.add(candidate.parentNode);
      } else {
        roots.add(candidate);
      }
    }

    return [...roots].filter((root) => this.isProcessableRoot(root));
  }

  private isProcessableRoot(node: Node): boolean {
    if (node instanceof Document || node instanceof Element || node instanceof ShadowRoot || node instanceof DocumentFragment) {
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
    if (node instanceof Document) {
      this.scanContainer(node, visitedContainers, tokens, occurrences);
      return;
    }

    if (node instanceof Element || node instanceof ShadowRoot || node instanceof DocumentFragment) {
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

    if (container instanceof Element) {
      this.scanEditableElement(container, tokens, occurrences);
      if (container.shadowRoot) {
        this.scanContainer(container.shadowRoot, visitedContainers, tokens, occurrences);
      }
      if (container instanceof HTMLIFrameElement) {
        this.scanIFrame(container, visitedContainers, tokens, occurrences);
      }
    }

    const childNodes = Array.from(container.childNodes);
    this.scanAdjacentTextNodeSequences(childNodes, tokens, occurrences);

    for (const child of childNodes) {
      if (child instanceof Element || child instanceof ShadowRoot || child instanceof DocumentFragment) {
        this.scanContainer(child, visitedContainers, tokens, occurrences);
      }
    }
  }

  private scanIFrame(
    iframe: HTMLIFrameElement,
    visitedContainers: WeakSet<Node>,
    tokens: Set<string>,
    occurrences: ResolvedOccurrence[]
  ): void {
    try {
      const frameDocument = iframe.contentDocument;
      if (!frameDocument) {
        return;
      }

      const currentOrigin = window.location.origin;
      const frameOrigin = frameDocument.location.origin;
      if (frameOrigin !== currentOrigin) {
        return;
      }

      this.scanContainer(frameDocument, visitedContainers, tokens, occurrences);
    } catch {
      // Cross-origin frame access is intentionally ignored.
    }
  }

  private scanEditableElement(element: Element, tokens: Set<string>, occurrences: ResolvedOccurrence[]): void {
    if (element instanceof HTMLInputElement) {
      if (element.type.toLowerCase() === "password") {
        return;
      }

      this.scanFormControlValue(element, "input", tokens, occurrences);
      return;
    }

    if (element instanceof HTMLTextAreaElement) {
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
    if (this.shouldSkipNode(element, value)) {
      return;
    }

    if (!value.includes(TOKEN_HINT_PREFIX)) {
      this.trackNodeSnapshot(element, value);
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

    this.trackNodeSnapshot(element, value);
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
      if (node instanceof Text) {
        pending.push(node);
      } else {
        flush();
      }
    }

    flush();
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

    if (!textNodes.every((node) => this.processedNodes.has(node))) {
      return false;
    }

    const previous = textNodes.map((node) => this.snapshotByNode.get(node) ?? "").join("");
    return previous === combinedValue;
  }

  private shouldSkipNode(node: Node, currentValue: string): boolean {
    if (!this.processedNodes.has(node)) {
      return false;
    }

    return this.snapshotByNode.get(node) === currentValue;
  }

  private trackTextSequence(textNodes: Text[]): void {
    for (const node of textNodes) {
      this.trackNodeSnapshot(node, node.data);
    }
  }

  private trackNodeSnapshot(node: Node, value: string): void {
    this.snapshotByNode.set(node, value);
    this.processedNodes.add(node);
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

    if (parentNode instanceof ShadowRoot) {
      segments.push("shadow-root");
      current = parentNode.host;
      continue;
    }

    if (parentNode instanceof Document) {
      segments.push("document");
      break;
    }

    current = parentNode;
  }

  return segments.reverse().join("/");
}
