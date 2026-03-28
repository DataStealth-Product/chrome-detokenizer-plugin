export type RootMutationHandler = (roots: Node[]) => void;

export class IncrementalObserver {
  private readonly observers = new Map<Node, MutationObserver>();
  private readonly documentsWithInputListeners = new WeakSet<Document>();
  private readonly queuedRoots = new Set<Node>();
  private flushTimer: number | undefined;
  private suppressionDepth = 0;

  constructor(
    private readonly onMutations: RootMutationHandler,
    private readonly debounceMs: number
  ) {}

  observeDocument(documentRoot: Document): void {
    this.observeRoot(documentRoot);
    this.attachInputListeners(documentRoot);
    this.discoverNestedRoots(documentRoot);
  }

  disconnect(): void {
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();

    if (this.flushTimer !== undefined) {
      window.clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    this.queuedRoots.clear();
  }

  runWithoutObservation<T>(callback: () => T): T {
    this.suppressionDepth += 1;
    try {
      return callback();
    } finally {
      this.suppressionDepth = Math.max(0, this.suppressionDepth - 1);
    }
  }

  queueRoot(root: Node): void {
    this.queuedRoots.add(root);
    this.scheduleFlush();
  }

  private observeRoot(root: Document | ShadowRoot): void {
    if (this.observers.has(root)) {
      return;
    }

    const observer = new MutationObserver((records) => {
      if (this.suppressionDepth > 0) {
        return;
      }

      for (const record of records) {
        this.queueRoot(record.target);
        for (const node of Array.from(record.addedNodes)) {
          this.attachForNode(node);
          this.queueRoot(node);
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true
    });

    this.observers.set(root, observer);
  }

  private attachInputListeners(doc: Document): void {
    if (this.documentsWithInputListeners.has(doc)) {
      return;
    }

    const listener = (event: Event): void => {
      if (this.suppressionDepth > 0) {
        return;
      }
      if (isNodeLike(event.target)) {
        this.queueRoot(event.target);
      }
    };

    doc.addEventListener("input", listener, true);
    doc.addEventListener("change", listener, true);
    this.documentsWithInputListeners.add(doc);
  }

  private discoverNestedRoots(root: ParentNode): void {
    this.attachForNode(root as unknown as Node);

    const elements = isDocumentNode(root as unknown as Node) ? root.querySelectorAll("*") : (root as Element | ShadowRoot).querySelectorAll("*");

    for (const element of Array.from(elements)) {
      this.attachForNode(element);
    }
  }

  private attachForNode(node: Node): void {
    if (!isElementNode(node) && !isDocumentNode(node) && !isShadowRootNode(node)) {
      return;
    }

    if (isElementNode(node) && node.shadowRoot) {
      this.observeRoot(node.shadowRoot);
      this.discoverNestedRoots(node.shadowRoot);
    }

  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) {
      return;
    }

    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = undefined;
      const roots = [...this.queuedRoots];
      this.queuedRoots.clear();

      if (roots.length > 0) {
        this.onMutations(roots);
      }
    }, this.debounceMs);
  }
}

function isDocumentNode(node: Node | null | undefined): node is Document {
  return node?.nodeType === Node.DOCUMENT_NODE;
}

function isElementNode(node: Node | null | undefined): node is Element {
  return node?.nodeType === Node.ELEMENT_NODE;
}

function isShadowRootNode(node: Node | null | undefined): node is ShadowRoot {
  return node?.nodeType === Node.DOCUMENT_FRAGMENT_NODE && "host" in node;
}

function isNodeLike(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "nodeType" in value;
}
