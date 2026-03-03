import { z } from "zod";

export const MessageType = {
  CONTENT_DETECTED_TOKENS: "CONTENT_DETECTED_TOKENS",
  BACKGROUND_MAPPINGS_READY: "BACKGROUND_MAPPINGS_READY",
  POPUP_GET_STATUS: "POPUP_GET_STATUS",
  POPUP_SET_ENABLED: "POPUP_SET_ENABLED"
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export const TargetTypeSchema = z.enum(["text", "input", "textarea", "contenteditable"]);
export type TargetType = z.infer<typeof TargetTypeSchema>;

export const TokenOccurrenceSchema = z.object({
  token: z.string().min(1),
  targetType: TargetTypeSchema,
  nodePath: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative()
});
export type TokenOccurrence = z.infer<typeof TokenOccurrenceSchema>;

export const TokenDetectionResultSchema = z.object({
  tokens: z.array(z.string().min(1)),
  occurrences: z.array(TokenOccurrenceSchema)
});
export type TokenDetectionResult = z.infer<typeof TokenDetectionResultSchema>;

export const DetokenizeRequestSchema = z.object({
  domain: z.string().min(1),
  tokens: z.array(z.string().min(1)).max(1000)
});
export type DetokenizeRequest = z.infer<typeof DetokenizeRequestSchema>;

export const DetokenizeResponseSchema = z.object({
  mappings: z.record(z.string())
});
export type DetokenizeResponse = z.infer<typeof DetokenizeResponseSchema>;

export const DetokenizeMetricsSchema = z.object({
  detectedCount: z.number().int().nonnegative(),
  detokenizedCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  avgLatencyMs: z.number().nonnegative()
});
export type DetokenizeMetrics = z.infer<typeof DetokenizeMetricsSchema>;

export const ContentDetectedTokensMessageSchema = z.object({
  type: z.literal(MessageType.CONTENT_DETECTED_TOKENS),
  payload: z.object({
    domain: z.string().min(1),
    tokens: z.array(z.string().min(1)).max(1000)
  })
});
export type ContentDetectedTokensMessage = z.infer<typeof ContentDetectedTokensMessageSchema>;

export const BackgroundMappingsReadyMessageSchema = z.object({
  type: z.literal(MessageType.BACKGROUND_MAPPINGS_READY),
  payload: z.object({
    mappings: z.record(z.string()),
    requestId: z.string().min(1),
    latencyMs: z.number().nonnegative(),
    error: z.string().optional()
  })
});
export type BackgroundMappingsReadyMessage = z.infer<typeof BackgroundMappingsReadyMessageSchema>;

export const PopupGetStatusMessageSchema = z.object({
  type: z.literal(MessageType.POPUP_GET_STATUS),
  payload: z.object({
    tabId: z.number().int().nonnegative()
  })
});
export type PopupGetStatusMessage = z.infer<typeof PopupGetStatusMessageSchema>;

export const PopupSetEnabledMessageSchema = z.object({
  type: z.literal(MessageType.POPUP_SET_ENABLED),
  payload: z.object({
    tabId: z.number().int().nonnegative(),
    enabled: z.boolean()
  })
});
export type PopupSetEnabledMessage = z.infer<typeof PopupSetEnabledMessageSchema>;

export const PopupStatusResponseSchema = z.object({
  enabled: z.boolean(),
  metrics: DetokenizeMetricsSchema,
  lastError: z.string().optional()
});
export type PopupStatusResponse = z.infer<typeof PopupStatusResponseSchema>;

export const DetectedTokensResponseSchema = z.object({
  mappings: z.record(z.string()),
  requestId: z.string().min(1),
  latencyMs: z.number().nonnegative(),
  error: z.string().optional()
});
export type DetectedTokensResponse = z.infer<typeof DetectedTokensResponseSchema>;

export function parseMessage<T>(schema: z.ZodSchema<T>, value: unknown): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
