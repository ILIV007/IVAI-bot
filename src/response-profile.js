import { MODES, USER_FACING_MODES, modeOutputLimit } from "./config.js";

const RESPONSE_INSTRUCTIONS = Object.freeze({
  [MODES.AUTO]: "Give a complete, appropriately sized answer. Be concise when the request is simple, but never stop mid-sentence, mid-list, mid-code block, or before the requested conclusion. Use compact structure when more detail is needed.",
  [MODES.FAST]: "Give a concise, accurate, self-contained answer. Prefer one short paragraph or up to three brief bullets. Never stop mid-sentence, mid-list, mid-code block, or before the requested conclusion; summarize instead of leaving an answer unfinished.",
  [MODES.DEEP]: "Give a structured, carefully reasoned answer, but avoid hidden chain-of-thought. State concise reasoning and conclusions.",
  [MODES.CODE]: "Provide correct, secure, production-minded code with a short explanation and fenced code blocks when appropriate.",
  [MODES.PROMPT]: "Transform the request into a precise reusable prompt. Include an optimized prompt and brief usage notes.",
  [MODES.GUEST]: "Give a helpful, accurate response suitable for a guest conversation.",
  [MODES.GUARD]: "Prioritize safety, clarity, and concise moderation guidance.",
  [MODES.SECRETARY]: "Turn the request into clear notes, tasks, dates, and next actions. Do not invent commitments.",
  [MODES.MANAGEMENT]: "Assist with community management using concise, transparent, actionable guidance.",
  [MODES.THREAD]: "Treat this conversation or Telegram topic as a focused work thread. Keep context scoped to the thread, summarize decisions briefly, and end with the next useful action when appropriate."
});

function workersAiReserveUnits(mode) {
  if (mode === MODES.GUARD) return 250;
  if ([MODES.DEEP, MODES.CODE].includes(mode)) return 800;
  if (mode === MODES.AUTO) return 550;
  if (mode === MODES.FAST) return 400;
  return 450;
}

/**
 * Auto is a first-class visible mode. It is never converted to Fast, Deep, or
 * Code based on prompt content; model/provider choice is handled separately.
 */
export function resolveResponseMode(selectedMode) {
  return selectedMode && USER_FACING_MODES.has(selectedMode) ? selectedMode : MODES.AUTO;
}

export function responseProfile(selectedMode) {
  const mode = resolveResponseMode(selectedMode);
  return Object.freeze({
    mode,
    instruction: RESPONSE_INSTRUCTIONS[mode] || "Give a helpful, accurate response.",
    maxOutputTokens: modeOutputLimit(mode),
    workersAiReserve: workersAiReserveUnits(mode),
    temperature: mode === MODES.CODE ? 0.2 : 0.55,
    allowRichMath: [MODES.DEEP, MODES.CODE].includes(mode)
  });
}

export function isResponseMode(value) {
  return USER_FACING_MODES.has(value);
}
