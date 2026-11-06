// Bearer secret check shared by the unattended cron routes. The secret never travels in a
// query string and is compared in constant time.

const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/**
 * Returns a ready-to-send error response when the request is not an authorized cron call,
 * or null when it may proceed.
 */
export async function authorizeCronRequest(
  request: Request,
  secret: string | undefined,
): Promise<Response | null> {
  if (!secret) {
    console.error(
      "[cron] CRON_SECRET is not set. Add it to the production environment before scheduling this route.",
    );
    return Response.json(
      { error: "Cron is not configured. Set CRON_SECRET in the server environment." },
      { status: 503 },
    );
  }
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!provided) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [given, expected] = await Promise.all([digest(provided), digest(secret)]);
  let difference = given.length ^ expected.length;
  for (let index = 0; index < Math.min(given.length, expected.length); index += 1) {
    difference |= (given[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return difference === 0 ? null : Response.json({ error: "Unauthorized" }, { status: 401 });
}

/** Absolute origin used in customer links, ignoring a spoofable Host header where possible. */
export function cronOrigin(request: Request): string {
  return (
    process.env["PUBLIC_SITE_URL"] ||
    process.env["APP_URL"] ||
    new URL(request.url).origin
  ).replace(/\/+$/, "");
}
