# Example: React app integration

```tsx
// src/main.tsx
import { AnalyticsProvider } from "@ai-analytics/sdk/react";

createRoot(document.getElementById("root")!).render(
  <AnalyticsProvider options={{
    apiKey: import.meta.env.VITE_ANALYTICS_PUBLIC_KEY,
    host: import.meta.env.VITE_ANALYTICS_HOST,
    release: import.meta.env.VITE_APP_VERSION,
  }}>
    <App />
  </AnalyticsProvider>
);
```

```tsx
// src/pages/Pricing.tsx
import { useAnalytics, usePageView } from "@ai-analytics/sdk/react";

export function Pricing() {
  usePageView("pricing");
  const analytics = useAnalytics();

  return (
    <PlanGrid onSelect={(plan) =>
      analytics.track("plan_selected", { plan: plan.id, price: plan.price })
    } />
  );
}
```

```tsx
// after login
analytics.identify(user.id, { plan: user.plan, company_size: user.companySize });

// after logout
analytics.reset();
```
