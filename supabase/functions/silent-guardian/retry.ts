/**
 * Safe network self-heal. Only retry reads/idempotent operations, never an
 * ambiguous Resend send. Maximum: 1 attempt + 3 bounded retries.
 */
export const TRANSIENT_HTTP_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
export const READ_RETRY_DELAYS_MS = [600, 1800, 5400] as const;

export function isTransientHttpStatus(status: number): boolean {
  return TRANSIENT_HTTP_CODES.has(status);
}

export async function retryRead(
  request: () => Promise<Response>,
  options: {
    delaysMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<Response> {
  const delays = options.delaysMs ?? READ_RETRY_DELAYS_MS;
  if (delays.length > 3 || delays.some((ms) => ms < 0 || !Number.isFinite(ms))) {
    throw new RangeError("guardian_retry_budget_invalid");
  }
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const response = await request();
      if (!isTransientHttpStatus(response.status) || attempt === delays.length) return response;
    } catch (error) {
      if (attempt === delays.length) throw error;
    }
    await sleep(delays[attempt]);
  }
  throw new Error("guardian_retry_unreachable");
}
