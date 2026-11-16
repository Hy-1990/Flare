export const TEXT_PROVIDERS = {
  deepseek: { label: "DeepSeek", key: "deepseekKey", model: "model" },
  openai: { label: "GPT · OpenAI API", key: "openaiKey", model: "openaiModel" },
  anthropic: {
    label: "Claude · Anthropic API",
    key: "anthropicKey",
    model: "anthropicModel",
  },
  codex: { label: "Codex CLI", model: "codexModel", cli: "codex" },
  claude: { label: "Claude CLI", model: "claudeModel", cli: "claude" },
};

// Verified 2026-11-16 against official model lists. Presets are not an account entitlement check.
// https://api-docs.deepseek.com/api/list-models/
// https://developers.openai.com/api/docs/models
// https://platform.claude.com/docs/en/models/overview
// https://code.claude.com/docs/en/model-config
const gpt = [
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol", hint: "均衡" },
  { id: "gpt-6-astra", name: "GPT-6 Astra", hint: "复杂任务" },
  { id: "gpt-6.1-terra", name: "GPT-6.1 Terra", hint: "快速" },
  { id: "gpt-6-luna", name: "GPT-6 Luna", hint: "轻量" },
];
export const MODEL_OPTIONS = {
  deepseek: [
    { id: "deepseek-flash", name: "DeepSeek Flash", hint: "默认" },
    { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", hint: "" },
  ],
  openai: gpt,
  anthropic: [
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", hint: "均衡" },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", hint: "复杂任务" },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", hint: "轻量" },
    { id: "claude-fable-5-2", name: "Claude Fable 5.2", hint: "" },
  ],
  codex: [{ id: "", name: "CLI", hint: "默认" }, ...gpt],
  claude: [
    { id: "", name: "CLI", hint: "默认" },
    { id: "sonnet", name: "Claude Sonnet", hint: "均衡" },
    { id: "opus", name: "Claude Opus", hint: "复杂任务" },
    { id: "haiku", name: "Claude Haiku", hint: "轻量" },
    { id: "fable", name: "Claude Fable", hint: "" },
  ],
};
