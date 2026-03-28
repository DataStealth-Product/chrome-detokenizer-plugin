import type { TargetType, TokenOccurrence } from "../shared/contracts";

export interface TextSegment {
  node: Text;
  start: number;
  end: number;
}

export interface TextResolvedOccurrence extends TokenOccurrence {
  targetType: "text" | "contenteditable";
  segments: TextSegment[];
}

export interface InputResolvedOccurrence extends TokenOccurrence {
  targetType: "input" | "textarea";
  element: HTMLInputElement | HTMLTextAreaElement;
}

export interface AttributeResolvedOccurrence extends TokenOccurrence {
  targetType: "attribute";
  attributeName: string;
  element: Element;
}

export type ResolvedOccurrence = TextResolvedOccurrence | InputResolvedOccurrence | AttributeResolvedOccurrence;

export interface ResolvedDetectionResult {
  tokens: string[];
  occurrences: ResolvedOccurrence[];
}

export interface MatchRange {
  token: string;
  start: number;
  end: number;
}

export function targetTypeFromElement(element: Element): TargetType {
  if (element.tagName === "TEXTAREA") {
    return "textarea";
  }

  if (element.tagName === "INPUT") {
    return "input";
  }

  return "text";
}
