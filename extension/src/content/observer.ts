export type RootMutationHandler = (roots: Node[]) => void;

export class IncrementalObserver {
  private readonly observers = new Map<Node, MutationObserver>();
  private readonly documentsWithInputListeners = new WeakSet<Document>();
  private readonly watchedFrames = new WeakSet<HTMLIFrameElement>();
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
      if (event.target instanceof Node) {
        this.queueRoot(event.target);
      }
    };

    doc.addEventListener("input", listener, true);
    doc.addEventListener("change", listener, true);
    this.documentsWithInputListeners.add(doc);
  }

  private discoverNestedRoots(root: ParentNode): void {
    this.attachForNode(root as unknown as Node);

    const elements = root instanceof Document ? root.querySelectorAll("*") : (root as Element | ShadowRoot).querySelectorAll("*");

    for (const element of Array.from(elements)) {
      this.attachForNode(element);
    }
  }

  private attachForNode(node: Node): void {
    if (!(node instanceof Element) && !(node instanceof Document) && !(node instanceof ShadowRoot)) {
      return;
    }

    if (node instanceof Element && node.shadowRoot) {
      this.observeRoot(node.shadowRoot);
      this.discoverNestedRoots(node.shadowRoot);
    }

    if (node instanceof HTMLIFrameElement) {
      this.observeIFrame(node);
    }
  }

  private observeIFrame(iframe: HTMLIFrameElement): void {
    if (this.watchedFrames.has(iframe)) {
      return;
    }

    const attach = (): void => {
      try {
        const frameDocument = iframe.contentDocument;
        if (!frameDocument) {
          return;
        }

        if (frameDocument.location.origin !== window.location.origin) {
          return;
        }

        this.observeDocument(frameDocument);
        this.queueRoot(frameDocument);
      } catch {
        // Ignore cross-origin frame access.
      }
    };

    iframe.addEventListener("load", attach);
    attach();
    this.watchedFrames.add(iframe);
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
