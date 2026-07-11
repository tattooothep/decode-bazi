const PRIVATE_AI_KEYS = new Set([
  "model",
  "provider",
  "provider_model",
  "judge_model",
  "judge_attempted_models",
  "judge_backup_used",
  "attempted_models",
  "panel_models",
  "preferred_panel_models",
  "fallback_judge_models",
  "primary_judge_model",
  "engine",
]);

const PROVIDER_ERROR_PATTERN =
  /(?:anthropic|claude|openai|chatgpt|gpt[-_ ]?\w*|gemini(?:[-_ ]?\w*)?|grok|openrouter|provider[_ -]?\w*|codex)/i;

const CONTEXT_ERROR_PATTERN = /(?:context|token).*(?:limit|length|window|maximum)|(?:limit|length).*(?:context|token)/i;

function publicErrorValue(value: string): string {
  if (!PROVIDER_ERROR_PATTERN.test(value)) return value;
  return CONTEXT_ERROR_PATTERN.test(value) ? "analysis_context_limit" : "analysis_unavailable";
}

function sanitize(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitize(item));

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(source)) {
      if (PRIVATE_AI_KEYS.has(childKey.toLowerCase())) continue;
      clean[childKey] = sanitize(childValue, childKey);
    }
    return clean;
  }

  if (typeof value === "string" && ["error", "message", "detail", "code"].includes(key.toLowerCase())) {
    return publicErrorValue(value);
  }

  return value;
}

/** Removes infrastructure details at a public API boundary without changing answer text. */
export function publicAiPayload<T>(value: T): T {
  return sanitize(value) as T;
}
