/**
 * Webhook connector — forwards selected events to any HTTPS endpoint.
 * Payloads are HMAC-SHA256 signed (X-Analytics-Signature) so receivers can
 * verify authenticity.
 *
 * options: { url: string; secret?: string; events?: string[] }  // no list = all
 */
import { createHmac } from "node:crypto";
import type { AnalyticsPlugin } from "@ai-analytics/agent";

export const webhookConnector: AnalyticsPlugin = {
  name: "webhook",
  version: "1.0.0",

  async onEvent(event, ctx) {
    const { url, secret, events } = ctx.options as { url: string; secret?: string; events?: string[] };
    if (!url) return;
    if (events?.length && !events.includes(event.name)) return;

    const body = JSON.stringify({ type: "event", data: event, sentAt: new Date().toISOString() });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret) headers["x-analytics-signature"] = createHmac("sha256", secret).update(body).digest("hex");

    const res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) ctx.log(`webhook delivery failed: ${res.status}`, { event: event.name });
  },
};
