import { z } from "zod";

export const MessageType = {
  CONTENT_DETECTED_TOKENS: "CONTENT_DETECTED_TOKENS",
  BACKGROUND_MAPPINGS_READY: "BACKGROUND_MAPPINGS_READY",
  POPUP_GET_STATUS: "POPUP_GET_STATUS",
  POPUP_SET_ENABLED: "POPUP_SET_ENABLED",
  POPUP_SET_CROSS_ORIGIN_IFRAMES: "POPUP_SET_CROSS_ORIGIN_IFRAMES",
  POPUP_SET_VISUAL_OCR_ENABLED: "POPUP_SET_VISUAL_OCR_ENABLED",
  POPUP_SET_AUTOMATIC_DOWNLOADS_ENABLED: "POPUP_SET_AUTOMATIC_DOWNLOADS_ENABLED",
  POPUP_CLEAR_SENSITIVE_STATE: "POPUP_CLEAR_SENSITIVE_STATE",
  CONTENT_GET_RUNTIME_CONFIG: "CONTENT_GET_RUNTIME_CONFIG",
  BACKGROUND_PUSH_RUNTIME_CONFIG: "BACKGROUND_PUSH_RUNTIME_CONFIG",
  CONTENT_PROCESS_DOWNLOAD: "CONTENT_PROCESS_DOWNLOAD",
  CONTENT_SCAN_VISUAL_SURFACES: "CONTENT_SCAN_VISUAL_SURFACES",
  BACKGROUND_PROCESS_JOB_UPDATE: "BACKGROUND_PROCESS_JOB_UPDATE"
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

export const TargetTypeSchema = z.enum(["text", "input", "textarea", "contenteditable", "attribute"]);
export type TargetType = z.infer<typeof TargetTypeSchema>;

export const TokenOccurrenceSchema = z.object({
  token: z.string().min(1),
  targetType: TargetTypeSchema,
  nodePath: z.string().min(1),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  attributeName: z.string().min(1).optional()
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

export const RuntimeConfigSchema = z.object({
  enabled: z.boolean(),
  crossOriginIframesEnabled: z.boolean(),
  visualOcrEnabled: z.boolean(),
  automaticDownloadsEnabled: z.boolean()
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export const ArtifactKindSchema = z.enum(["text", "json", "image", "pdf", "office", "visual-surface"]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ProcessingJobStatusSchema = z.enum([
  "queued",
  "fetching",
  "extracting",
  "ocr",
  "detokenizing",
  "rewriting",
  "purged",
  "failed",
  "complete"
]);
export type ProcessingJobStatus = z.infer<typeof ProcessingJobStatusSchema>;

export const SourceDescriptorSchema = z.object({
  url: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().optional()
});
export type SourceDescriptor = z.infer<typeof SourceDescriptorSchema>;

export const OcrBlockSchema = z.object({
  text: z.string().min(1),
  left: z.number().nonnegative(),
  top: z.number().nonnegative(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative()
});
export type OcrBlock = z.infer<typeof OcrBlockSchema>;

export const ReplacementRegionSchema = z.object({
  token: z.string().min(1),
  replacement: z.string().min(1),
  left: z.number().nonnegative(),
  top: z.number().nonnegative(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative()
});
export type ReplacementRegion = z.infer<typeof ReplacementRegionSchema>;

export const PurgePolicySchema = z.object({
  ttlMs: z.number().int().positive()
});
export type PurgePolicy = z.infer<typeof PurgePolicySchema>;

export const ProcessingJobSchema = z.object({
  id: z.string().min(1),
  tabId: z.number().int().nonnegative(),
  artifactKind: ArtifactKindSchema,
  status: ProcessingJobStatusSchema,
  source: SourceDescriptorSchema,
  createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative()
});
export type ProcessingJob = z.infer<typeof ProcessingJobSchema>;

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

export const PopupSetCrossOriginIframesMessageSchema = z.object({
  type: z.literal(MessageType.POPUP_SET_CROSS_ORIGIN_IFRAMES),
  payload: z.object({
    tabId: z.number().int().nonnegative(),
    enabled: z.boolean()
  })
});
export type PopupSetCrossOriginIframesMessage = z.infer<typeof PopupSetCrossOriginIframesMessageSchema>;

export const PopupSetVisualOcrEnabledMessageSchema = z.object({
  type: z.literal(MessageType.POPUP_SET_VISUAL_OCR_ENABLED),
  payload: z.object({
    tabId: z.number().int().nonnegative(),
    enabled: z.boolean()
  })
});
export type PopupSetVisualOcrEnabledMessage = z.infer<typeof PopupSetVisualOcrEnabledMessageSchema>;

export const PopupSetAutomaticDownloadsEnabledMessageSchema = z.object({
  type: z.literal(MessageType.POPUP_SET_AUTOMATIC_DOWNLOADS_ENABLED),
  payload: z.object({
    tabId: z.number().int().nonnegative(),
    enabled: z.boolean()
  })
});
export type PopupSetAutomaticDownloadsEnabledMessage = z.infer<typeof PopupSetAutomaticDownloadsEnabledMessageSchema>;

export const PopupClearSensitiveStateMessageSchema = z.object({
  type: z.literal(MessageType.POPUP_CLEAR_SENSITIVE_STATE),
  payload: z.object({
    tabId: z.number().int().nonnegative()
  })
});
export type PopupClearSensitiveStateMessage = z.infer<typeof PopupClearSensitiveStateMessageSchema>;

export const ContentGetRuntimeConfigMessageSchema = z.object({
  type: z.literal(MessageType.CONTENT_GET_RUNTIME_CONFIG),
  payload: z.object({}).default({})
});
export type ContentGetRuntimeConfigMessage = z.infer<typeof ContentGetRuntimeConfigMessageSchema>;

export const BackgroundPushRuntimeConfigMessageSchema = z.object({
  type: z.literal(MessageType.BACKGROUND_PUSH_RUNTIME_CONFIG),
  payload: RuntimeConfigSchema
});
export type BackgroundPushRuntimeConfigMessage = z.infer<typeof BackgroundPushRuntimeConfigMessageSchema>;

export const ContentProcessDownloadMessageSchema = z.object({
  type: z.literal(MessageType.CONTENT_PROCESS_DOWNLOAD),
  payload: z.object({
    url: z.string().min(1),
    fileName: z.string().min(1),
    contentType: z.string().optional()
  })
});
export type ContentProcessDownloadMessage = z.infer<typeof ContentProcessDownloadMessageSchema>;

export const SurfaceKindSchema = z.enum(["image", "canvas", "pdf"]);
export type SurfaceKind = z.infer<typeof SurfaceKindSchema>;

export const VisualSurfaceDescriptorSchema = z.object({
  id: z.string().min(1),
  kind: SurfaceKindSchema,
  left: z.number(),
  top: z.number(),
  width: z.number().positive(),
  height: z.number().positive()
});
export type VisualSurfaceDescriptor = z.infer<typeof VisualSurfaceDescriptorSchema>;

export const ContentScanVisualSurfacesMessageSchema = z.object({
  type: z.literal(MessageType.CONTENT_SCAN_VISUAL_SURFACES),
  payload: z.object({
    domain: z.string().min(1),
    surfaces: z.array(VisualSurfaceDescriptorSchema).max(20),
    viewportWidth: z.number().positive(),
    viewportHeight: z.number().positive(),
    devicePixelRatio: z.number().positive()
  })
});
export type ContentScanVisualSurfacesMessage = z.infer<typeof ContentScanVisualSurfacesMessageSchema>;

export const BackgroundProcessJobUpdateMessageSchema = z.object({
  type: z.literal(MessageType.BACKGROUND_PROCESS_JOB_UPDATE),
  payload: z.object({
    job: ProcessingJobSchema,
    lastError: z.string().optional()
  })
});
export type BackgroundProcessJobUpdateMessage = z.infer<typeof BackgroundProcessJobUpdateMessageSchema>;

export const VisualOverlaySchema = z.object({
  surfaceId: z.string().min(1),
  replacementRegions: z.array(ReplacementRegionSchema)
});
export type VisualOverlay = z.infer<typeof VisualOverlaySchema>;

export const VisualOverlayResponseSchema = z.object({
  overlays: z.array(VisualOverlaySchema),
  requestId: z.string().min(1),
  latencyMs: z.number().nonnegative(),
  error: z.string().optional()
});
export type VisualOverlayResponse = z.infer<typeof VisualOverlayResponseSchema>;

export const PopupStatusResponseSchema = z.object({
  enabled: z.boolean(),
  crossOriginIframesEnabled: z.boolean(),
  visualOcrEnabled: z.boolean(),
  automaticDownloadsEnabled: z.boolean(),
  activeSensitiveJobsCount: z.number().int().nonnegative(),
  lastPurgeReason: z.string().optional(),
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
