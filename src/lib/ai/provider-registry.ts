export type AiFeature = "sifu" | "qimen" | "forecast" | "fusion" | "palm";

export type ProviderPolicy = {
  queue: "interactive" | "fusion" | "palm";
  primary: string;
  fallbacks: string[];
  timeoutMs: number;
  maxConcurrency: number;
};

const POLICIES: Record<AiFeature, ProviderPolicy> = {
  sifu: { queue: "interactive", primary: "openrouter", fallbacks: ["gemini"], timeoutMs: 120_000, maxConcurrency: 20 },
  qimen: { queue: "interactive", primary: "openrouter", fallbacks: ["gemini"], timeoutMs: 120_000, maxConcurrency: 10 },
  forecast: { queue: "interactive", primary: "openrouter", fallbacks: ["gemini"], timeoutMs: 120_000, maxConcurrency: 10 },
  fusion: { queue: "fusion", primary: "multi-panel", fallbacks: ["gemini"], timeoutMs: 1_200_000, maxConcurrency: 2 },
  palm: { queue: "palm", primary: "grok", fallbacks: ["gemini"], timeoutMs: 240_000, maxConcurrency: 2 },
};

export function providerPolicy(feature: AiFeature): ProviderPolicy {
  return { ...POLICIES[feature], fallbacks: [...POLICIES[feature].fallbacks] };
}

export function configuredProviderKeys(): Record<string, boolean> {
  return {
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    grok: Boolean(process.env.XAI_API_KEY || process.env.PALM_GROK_API_KEY),
  };
}
