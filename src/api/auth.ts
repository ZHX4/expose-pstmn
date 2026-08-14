import { timingSafeEqual } from "node:crypto";

function equalSecret(expected: string, supplied: string | undefined): boolean {
  if (!supplied) return false;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(supplied, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function getBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  return match?.[1];
}

export function authorizeRequest(expectedApiKey: string, authorization: string | undefined): boolean {
  return equalSecret(expectedApiKey, getBearerToken(authorization));
}
