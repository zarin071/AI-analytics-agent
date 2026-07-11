# Example: asking the AI agent

```bash
ASK() { curl -s -X POST $HOST/v1/ai/ask -H "authorization: Bearer $SK" \
        -H "content-type: application/json" -d "{\"question\": \"$1\"}"; }

ASK "Why did signups decrease?"
ASK "Show users who abandoned checkout in the last 7 days."
ASK "What changed after release 2.0?"
ASK "Which features do our churned users never touch?"
ASK "Compare retention of users acquired from paid vs organic."
```

Executive report + recommendations:

```bash
curl -X POST $HOST/v1/ai/summary   -H "authorization: Bearer $SK" -d '{"periodDays": 7}'
curl -X POST $HOST/v1/ai/recommend -H "authorization: Bearer $SK" -d '{"area": "onboarding"}'
```

What a grounded answer looks like (abridged):

> **Signups fell 22% week-over-week, driven almost entirely by Android.**
>
> **Evidence**
> - `user_signed_up` unique users: 941 this week vs 1,204 last week (`segment`)
> - Split by `context.device.os`: iOS −2%, Android −41% (`segment`, groupBy)
> - Drop begins Tue 10 Jun — same day as release **2.3.1** (`release_impact`: −38% after)
> - Funnel `signup_started → otp_entered → user_signed_up`: step-2 conversion fell from 81% → 44% on Android only (`run_funnel`)
>
> **Recommended actions**
> 1. Roll back or hotfix the OTP screen shipped in 2.3.1 …
