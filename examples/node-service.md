# Example: Node/Fastify backend integration

Server-side events are the reliable ones (payments, provisioning) — track them from the backend, not the browser.

```ts
// fastify
import { analyticsPlugin } from "@ai-analytics/sdk/fastify";

await app.register(analyticsPlugin, {
  apiKey: process.env.ANALYTICS_SECRET_KEY!,
  host: process.env.ANALYTICS_HOST!,
  getUserId: (req: any) => req.user?.id,
});

app.post("/api/subscribe", async (req) => {
  const sub = await billing.subscribe(req.user, req.body.plan);
  req.analytics.track("subscription_started", {
    plan: sub.plan, revenue: sub.mrr, currency: "USD",
  });
  return sub;
});
```

```ts
// plain Node worker
import { NodeAnalytics } from "@ai-analytics/sdk/node";

const analytics = new NodeAnalytics({ apiKey: process.env.ANALYTICS_SECRET_KEY!, host: HOST });
analytics.track("invoice_generated", { amount: 199 }, { userId: invoice.userId });
await analytics.shutdown();   // flush before exit
```

Register releases from CI so "what changed after release X" works:

```bash
curl -X POST $ANALYTICS_HOST/v1/releases \
  -H "authorization: Bearer $ANALYTICS_SECRET_KEY" \
  -d "{\"version\": \"$GIT_TAG\", \"notes\": \"$RELEASE_NOTES\"}"
```
