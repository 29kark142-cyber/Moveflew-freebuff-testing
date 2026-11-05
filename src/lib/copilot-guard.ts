/** Deterministic pre-model checks for the CrewAI assistant. Runs on the server before any AI call. */
export const REFUSAL = "I am only authorized to assist with your active workspace tools and navigation.";

const INJECTION = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|all|system|your)\b.{0,20}\b(instructions?|rules?|prompts?|guidelines?)\b/i,
  /\b(system|developer|hidden)\s+prompt\b/i,
  /\b(you are now|act as|pretend (to be|you are)|jailbreak|dan mode|developer mode)\b/i,
  /\b(export|dump|download|list|show|print|select)\b.{0,40}\b(database|db|tables?|schema|sql|rows)\b/i,
  /\b(env(ironment)?\s*(variables?|vars?)|process\.env|\.env\b|api[\s_-]?keys?|secrets?|service[\s_-]?role|tokens?|passwords?|credentials?)\b/i,
  /\b(other|all|every|another)\b.{0,30}\b(workspaces?|tenants?|companies|customers of other|accounts)\b/i,
  /\b(workspaces?|tenants?|companies)\b.{0,30}\b(on|across|in) the platform\b/i,
];

const PLATFORM = [
  /\b(super[\s-]?admin|platform[\s-]?(admin|owner|metrics?|stats?|revenue|logs?|health|wide|dashboard))\b/i,
  /\/admin\/platform/i,
  /\b(total|all)\b.{0,30}\b(platform|tenants?|subscribers?|registered companies)\b/i,
  /\b(system|audit|webhook)\s+logs?\b/i,
];

export type GuardResult = { kind: "refuse" } | { kind: "ok"; platformTopic: boolean };

export function screenCopilotMessage(text: string, isSuperAdmin: boolean): GuardResult {
  const t = text.normalize("NFKC").replace(/\s+/g, " ");
  if (INJECTION.some(r => r.test(t))) return { kind: "refuse" };
  const platformTopic = PLATFORM.some(r => r.test(t));
  if (platformTopic && !isSuperAdmin) return { kind: "refuse" };
  return { kind: "ok", platformTopic };
}
