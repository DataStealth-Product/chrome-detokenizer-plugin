export const APPROVED_TOKENS = [
  "[<TOKEN-Name-J>]",
  "[<TOKEN-Name-M>]",
  "[<TOKEN-Name-E>]"
] as const;

export type ApprovedToken = (typeof APPROVED_TOKENS)[number];

export const APPROVED_TOKEN_SET: ReadonlySet<string> = new Set(APPROVED_TOKENS);

export const TOKEN_SEND_MODE = "allowlist_only" as const;

export function isApprovedToken(token: string): token is ApprovedToken {
  return APPROVED_TOKEN_SET.has(token);
}
