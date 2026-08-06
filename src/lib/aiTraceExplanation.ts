import {
  formatTraceValue,
  traceSourceLabel,
  type TraceSheetModel,
} from "./traceModel";
import { supabase, supabaseConfigured } from "./supabase";

const MAX_ROWS = 12;
const MAX_TITLE_LENGTH = 160;
const MAX_VALUE_LENGTH = 160;
const MAX_FORMULA_LENGTH = 160;
const MAX_DETERMINISTIC_EXPLANATION_LENGTH = 600;
const MAX_AI_OUTPUT_LENGTH = 1_200;

export type AiTraceRowPayload = {
  label: string;
  value: string;
  source: string;
  formula?: string;
};

export type AiTracePayload = {
  schemaVersion: 1;
  locale: "vi-VN";
  trace: {
    title: string;
    primary?: string;
    deterministicExplanation: string;
    rows: AiTraceRowPayload[];
  };
};

type AiTraceResponse = {
  explanation?: unknown;
};

export const aiTraceFeatureEnabled = import.meta.env.VITE_AI_TRACE_ENABLED === "true";
export const aiTraceAvailable = aiTraceFeatureEnabled && supabaseConfigured;

export class AiTraceExplanationError extends Error {
  constructor(
    message: string,
    readonly code:
      | "FEATURE_DISABLED"
      | "BACKEND_UNAVAILABLE"
      | "AUTH_REQUIRED"
      | "UPSTREAM_UNAVAILABLE"
      | "INVALID_RESPONSE",
  ) {
    super(message);
    this.name = "AiTraceExplanationError";
  }
}

function cleanText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Builds the only payload allowed to leave the browser for an AI trace request.
 * Local row IDs, links, database records and authentication data are deliberately omitted.
 */
export function buildAiTracePayload(model: TraceSheetModel): AiTracePayload {
  const primary = model.primary
    ? cleanText(formatTraceValue(model.primary), MAX_VALUE_LENGTH)
    : undefined;

  return {
    schemaVersion: 1,
    locale: "vi-VN",
    trace: {
      title: cleanText(model.title, MAX_TITLE_LENGTH),
      primary: primary || undefined,
      deterministicExplanation: cleanText(
        model.explanation,
        MAX_DETERMINISTIC_EXPLANATION_LENGTH,
      ),
      rows: model.rows.slice(0, MAX_ROWS).map((row) => {
        const formula = row.formula
          ? cleanText(row.formula, MAX_FORMULA_LENGTH)
          : undefined;
        return {
          label: cleanText(row.label, MAX_TITLE_LENGTH),
          value: cleanText(formatTraceValue(row.value), MAX_VALUE_LENGTH),
          source: cleanText(traceSourceLabel(row.source), MAX_TITLE_LENGTH),
          formula: formula || undefined,
        };
      }),
    },
  };
}

export function parseAiTraceExplanationResponse(input: unknown): string {
  if (!input || typeof input !== "object") {
    throw new AiTraceExplanationError(
      "AI chưa trả về nội dung hợp lệ. Hãy dùng phần giải thích chuẩn phía trên.",
      "INVALID_RESPONSE",
    );
  }
  const explanation = (input as AiTraceResponse).explanation;
  if (typeof explanation !== "string") {
    throw new AiTraceExplanationError(
      "AI chưa trả về nội dung hợp lệ. Hãy dùng phần giải thích chuẩn phía trên.",
      "INVALID_RESPONSE",
    );
  }
  const cleaned = cleanText(explanation, MAX_AI_OUTPUT_LENGTH);
  if (!cleaned) {
    throw new AiTraceExplanationError(
      "AI chưa trả về nội dung hợp lệ. Hãy dùng phần giải thích chuẩn phía trên.",
      "INVALID_RESPONSE",
    );
  }
  return cleaned;
}

export async function requestAiTraceExplanation(model: TraceSheetModel): Promise<string> {
  if (!aiTraceFeatureEnabled) {
    throw new AiTraceExplanationError(
      "Giải thích AI chưa được bật.",
      "FEATURE_DISABLED",
    );
  }
  if (!supabase) {
    throw new AiTraceExplanationError(
      "Dịch vụ AI chưa được cấu hình. Hãy dùng phần giải thích chuẩn phía trên.",
      "BACKEND_UNAVAILABLE",
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError || !authData.session) {
    throw new AiTraceExplanationError(
      "Bạn cần đăng nhập lại trước khi yêu cầu giải thích AI.",
      "AUTH_REQUIRED",
    );
  }

  const { data, error } = await supabase.functions.invoke("explain-trace", {
    body: buildAiTracePayload(model),
  });
  if (error) {
    throw new AiTraceExplanationError(
      "AI tạm thời không khả dụng. Phần giải thích chuẩn phía trên vẫn dùng được.",
      "UPSTREAM_UNAVAILABLE",
    );
  }
  return parseAiTraceExplanationResponse(data);
}
