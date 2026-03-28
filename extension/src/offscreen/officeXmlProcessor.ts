import { findApprovedTokenRanges, findApprovedTokens, replaceMappedTokens } from "../shared/tokenMatching";

export type OfficeExtension = "docx" | "xlsx" | "pptx";

interface XmlConfig {
  containerLocalNames: Set<string>;
  leafTextLocalNames: Set<string>;
}

const CONFIG_BY_EXTENSION: Record<OfficeExtension, XmlConfig> = {
  docx: {
    containerLocalNames: new Set(["p"]),
    leafTextLocalNames: new Set(["t", "instrText"])
  },
  pptx: {
    containerLocalNames: new Set(["p"]),
    leafTextLocalNames: new Set(["t"])
  },
  xlsx: {
    containerLocalNames: new Set(["si", "is", "row", "comment"]),
    leafTextLocalNames: new Set(["t", "v"])
  }
};

interface TextSegment {
  element: Element;
  start: number;
  end: number;
}

export interface OfficeXmlProcessResult {
  tokens: string[];
  xml: string;
}

export function scanOfficeXml(xml: string, extension: OfficeExtension): OfficeXmlProcessResult {
  return processOfficeXml(xml, extension);
}

export function rewriteOfficeXml(xml: string, extension: OfficeExtension, mappings: Record<string, string>): OfficeXmlProcessResult {
  return processOfficeXml(xml, extension, mappings);
}

function processOfficeXml(
  xml: string,
  extension: OfficeExtension,
  mappings?: Record<string, string>
): OfficeXmlProcessResult {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xml, "application/xml");
  if (documentNode.querySelector("parsererror")) {
    return {
      tokens: findApprovedTokens(xml),
      xml
    };
  }

  const config = CONFIG_BY_EXTENSION[extension];
  const seenTokens = new Set<string>();

  for (const element of documentNode.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const tokens = findApprovedTokens(attribute.value);
      for (const token of tokens) {
        seenTokens.add(token);
      }
      if (mappings && tokens.length > 0) {
        element.setAttribute(attribute.name, replaceMappedTokens(attribute.value, mappings));
      }
    }
  }

  const containers = [...documentNode.querySelectorAll("*")].filter((element) =>
    config.containerLocalNames.has(element.localName)
  );

  if (containers.length === 0 && documentNode.documentElement) {
    containers.push(documentNode.documentElement);
  }

  for (const container of containers) {
    const segments = collectTextSegments(container, config.leafTextLocalNames);
    if (segments.length === 0) {
      continue;
    }

    const combined = segments.map((segment) => segment.element.textContent ?? "").join("");
    const ranges = findApprovedTokenRanges(combined);
    for (const range of ranges) {
      seenTokens.add(range.token);
    }

    if (!mappings || ranges.length === 0) {
      continue;
    }

    for (const range of [...ranges].reverse()) {
      const replacement = mappings[range.token];
      if (replacement === undefined) {
        continue;
      }
      replaceAcrossSegments(segments, range.start, range.end, replacement);
    }
  }

  return {
    tokens: [...seenTokens],
    xml: new XMLSerializer().serializeToString(documentNode)
  };
}

function collectTextSegments(container: Element, leafTextLocalNames: Set<string>): TextSegment[] {
  const segments: TextSegment[] = [];
  let offset = 0;

  for (const element of getElementsInDocumentOrder(container)) {
    if (!leafTextLocalNames.has(element.localName) || element.childElementCount > 0) {
      continue;
    }

    const text = element.textContent ?? "";
    segments.push({
      element,
      start: offset,
      end: offset + text.length
    });
    offset += text.length;
  }

  return segments;
}

function getElementsInDocumentOrder(root: Element): Element[] {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];
  let current = walker.currentNode as Element | null;
  if (current) {
    elements.push(current);
  }
  while ((current = walker.nextNode() as Element | null)) {
    elements.push(current);
  }
  return elements;
}

function replaceAcrossSegments(segments: TextSegment[], start: number, end: number, replacement: string): void {
  let replacementWritten = false;

  for (const segment of segments) {
    if (end <= segment.start || start >= segment.end) {
      continue;
    }

    const currentText = segment.element.textContent ?? "";
    const localStart = Math.max(0, start - segment.start);
    const localEnd = Math.min(segment.end, end) - segment.start;
    const prefix = currentText.slice(0, localStart);
    const suffix = currentText.slice(localEnd);

    if (!replacementWritten) {
      segment.element.textContent = `${prefix}${replacement}${suffix}`;
      replacementWritten = true;
    } else {
      segment.element.textContent = `${prefix}${suffix}`;
    }
  }
}
