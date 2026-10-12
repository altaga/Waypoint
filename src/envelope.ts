import { z } from "zod";
import { friendlyError, type FriendlyError } from "./errors.ts";
import { DISCLAIMER } from "./packs/schema.ts";

// Every tool answers with the same envelope (context doc §5.3):
// { voice, card, data, sources[], lastVerified, confidence, disclaimer, followUps[] }.
// `voice` is also sent as the text content block for clients without structured content.

export const Confidence = z.enum(["high", "medium", "low"]);

export const CardRow = z.object({
  label: z.string(),
  value: z.string(),
  status: z.enum(["ok", "warn", "blocked", "info"]).optional(),
});

export const Card = z.object({
  pattern: z.enum(["card", "list", "carousel", "map"]),
  title: z.string(),
  subtitle: z.string().optional(),
  rows: z.array(CardRow),
  footer: z.string().optional(),
});

export const SourceRef = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  license: z.string().optional(),
  retrieved: z.string().optional(),
});

/** Raw shape used as the outputSchema of every tool. */
export const EnvelopeShape = {
  voice: z.string(),
  card: Card,
  data: z.record(z.string(), z.unknown()),
  sources: z.array(SourceRef),
  lastVerified: z.string().nullable(),
  confidence: Confidence,
  disclaimer: z.string(),
  followUps: z.array(z.string()),
  missingFields: z.array(z.string()).optional(),
};

export type Envelope = {
  voice: string;
  card: z.infer<typeof Card>;
  data: Record<string, unknown>;
  sources: z.infer<typeof SourceRef>[];
  lastVerified: string | null;
  confidence: z.infer<typeof Confidence>;
  disclaimer: string;
  followUps: string[];
  missingFields?: string[];
};

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export function envelopeResult(env: Envelope, meta?: Record<string, unknown>): ToolResult {
  return {
    // Block 1: the voice summary. Block 2: the structured result serialized, as the
    // MCP spec recommends for clients that only read text content (for example an
    // LLM agent). Hosts that render structuredContent use that instead.
    content: [
      { type: "text", text: env.voice },
      { type: "text", text: JSON.stringify(env) },
    ],
    structuredContent: env as unknown as Record<string, unknown>,
    ...(meta ? { _meta: meta } : {}),
  };
}

export function errorResult(err: unknown, fallbackNextStep?: string, locale: "en" | "es" = "en"): ToolResult {
  const e: FriendlyError = friendlyError(err, fallbackNextStep, locale);
  return {
    isError: true,
    content: [{ type: "text", text: `${e.message} ${e.nextStep}` }],
  };
}

export function withDisclaimer(text: string, locale: "en" | "es"): string {
  return `${text} ${DISCLAIMER[locale]}`;
}

export const pick = (locale: "en" | "es", en: string, es: string) => (locale === "es" ? es : en);
