import { loadPromptSections } from "/home/jarvis/decode-app/src/lib/prompt-md";
const s = loadPromptSections("prompts/sifu-lang.md");
console.log("keys:", Object.keys(s).join(","));
console.log("VI head:", (s.VI || "(missing)").slice(0, 120));
