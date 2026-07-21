/**
 * Security boundary for subscription-backed agent CLIs.
 *
 * Prediction routes provide every chart fact and canon excerpt in the prompt.
 * They never need host filesystem, shell, web, MCP, memory, or subagents.
 */
export const CLAUDE_TEXT_ONLY_ARGS = [
  "--safe-mode",
  "--tools", "",
] as const;

/** Grok currently requires at least one valid built-in tool in an allowlist.
 * todo_write cannot read files, execute commands, call the network, or spawn
 * another agent, so it is retained solely to keep the headless client valid. */
export const GROK_TEXT_ONLY_ARGS = [
  "--verbatim",
  "--no-memory",
  "--no-subagents",
  "--disable-web-search",
  "--tools", "todo_write",
  "--max-turns", "2",
] as const;
