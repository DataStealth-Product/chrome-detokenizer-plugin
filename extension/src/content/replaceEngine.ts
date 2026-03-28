import type { AttributeResolvedOccurrence, ResolvedOccurrence, TextResolvedOccurrence } from "./types";

export class ReplaceEngine {
  applyMappings(occurrences: ResolvedOccurrence[], mappings: Record<string, string>): number {
    const sorted = [...occurrences].sort(compareOccurrencesDescending);
    let replacements = 0;

    for (const occurrence of sorted) {
      const replacement = mappings[occurrence.token];
      if (replacement === undefined) {
        continue;
      }

      const safeReplacement = sanitizeReplacement(replacement);

      if (occurrence.targetType === "input" || occurrence.targetType === "textarea") {
        const changed = this.replaceInFormControl(occurrence.element, occurrence.startOffset, occurrence.endOffset, occurrence.token, safeReplacement);
        if (changed) {
          occurrence.element.dataset.detokenized = "true";
          replacements += 1;
        }
        continue;
      }

      if (occurrence.targetType === "attribute") {
        const changed = this.replaceInAttribute(occurrence, safeReplacement);
        if (changed) {
          occurrence.element.dataset.detokenized = "true";
          replacements += 1;
        }
        continue;
      }

      const textOccurrence = occurrence as TextResolvedOccurrence;
      const changed = this.replaceInTextSegments(textOccurrence, safeReplacement);
      if (changed) {
        const parentElement = textOccurrence.segments[0]?.node.parentElement;
        if (parentElement) {
          parentElement.dataset.detokenized = "true";
        }
        replacements += 1;
      }
    }

    return replacements;
  }

  private replaceInFormControl(
    element: HTMLInputElement | HTMLTextAreaElement,
    start: number,
    end: number,
    expectedToken: string,
    replacement: string
  ): boolean {
    if (!element.isConnected) {
      return false;
    }

    const currentValue = element.value;
    const candidate = currentValue.slice(start, end);
    if (candidate !== expectedToken) {
      return false;
    }

    element.value = `${currentValue.slice(0, start)}${replacement}${currentValue.slice(end)}`;
    return true;
  }

  private replaceInAttribute(occurrence: AttributeResolvedOccurrence, replacement: string): boolean {
    if (!occurrence.element.isConnected) {
      return false;
    }

    const currentValue = occurrence.element.getAttribute(occurrence.attributeName);
    if (currentValue === null) {
      return false;
    }

    const candidate = currentValue.slice(occurrence.startOffset, occurrence.endOffset);
    if (candidate !== occurrence.token) {
      return false;
    }

    occurrence.element.setAttribute(
      occurrence.attributeName,
      `${currentValue.slice(0, occurrence.startOffset)}${replacement}${currentValue.slice(occurrence.endOffset)}`
    );
    return true;
  }

  private replaceInTextSegments(occurrence: TextResolvedOccurrence, replacement: string): boolean {
    const tokenText = this.readSegmentToken(occurrence);
    if (tokenText !== occurrence.token) {
      return false;
    }

    for (const [index, segment] of occurrence.segments.entries()) {
      if (!segment.node.isConnected) {
        return false;
      }

      const original = segment.node.data;
      const prefix = original.slice(0, segment.start);
      const suffix = original.slice(segment.end);

      if (index === 0) {
        segment.node.data = `${prefix}${replacement}${suffix}`;
      } else {
        segment.node.data = `${prefix}${suffix}`;
      }
    }

    return true;
  }

  private readSegmentToken(occurrence: TextResolvedOccurrence): string {
    let value = "";
    for (const segment of occurrence.segments) {
      value += segment.node.data.slice(segment.start, segment.end);
    }
    return value;
  }
}

function compareOccurrencesDescending(a: ResolvedOccurrence, b: ResolvedOccurrence): number {
  const aNode = getAnchorNode(a);
  const bNode = getAnchorNode(b);

  if (aNode === bNode) {
    return b.startOffset - a.startOffset;
  }

  const relation = aNode.compareDocumentPosition(bNode);
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
    return 1;
  }
  if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
    return -1;
  }

  return 0;
}

function getAnchorNode(occurrence: ResolvedOccurrence): Node {
  if (occurrence.targetType === "input" || occurrence.targetType === "textarea" || occurrence.targetType === "attribute") {
    return occurrence.element;
  }

  const textOccurrence = occurrence as TextResolvedOccurrence;
  return textOccurrence.segments[0]?.node ?? document.body;
}

function sanitizeReplacement(value: string): string {
  return String(value).replace(/\u0000/g, "");
}
