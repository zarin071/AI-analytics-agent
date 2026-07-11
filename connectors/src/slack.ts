/**
 * Slack connector — posts AI insights (and optional event alerts) to Slack
 * via an incoming webhook.
 *
 * options: { webhookUrl: string; channel?: string; alertEvents?: string[] }
 */
import type { AnalyticsPlugin } from "@ai-analytics/agent";

export const slackConnector: AnalyticsPlugin = {
  name: "slack",
  version: "1.0.0",

  async onInsight(insight, ctx) {
    const { webhookUrl } = ctx.options as { webhookUrl: string };
    if (!webhookUrl) return;
    const title =
      insight.kind === "anomaly" ? `🚨 Anomaly detected (${insight.severity})` :
      insight.kind === "summary" ? `📊 Executive summary — ${ctx.projectName}` :
      insight.question ?? `New ${insight.kind}`;
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        blocks: [
          { type: "header", text: { type: "plain_text", text: title.slice(0, 150) } },
          { type: "section", text: { type: "mrkdwn", text: insight.bodyMd.slice(0, 2900) } },
        ],
      }),
    });
  },

  async onEvent(event, ctx) {
    const { webhookUrl, alertEvents } = ctx.options as { webhookUrl: string; alertEvents?: string[] };
    if (!webhookUrl || !alertEvents?.includes(event.name)) return;
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `⚡ \`${event.name}\` by ${event.userId ?? "anonymous"}` }),
    });
  },
};
