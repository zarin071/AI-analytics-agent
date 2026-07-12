# Event Taxonomy

## Naming standard: `object_action`

- lowercase `snake_case`, at least two words: **object** then **action**
- past-tense actions: `checkout_completed`, not `complete_checkout`
- ✓ `user_signed_up`, `report_exported`, `trial_started`
- ✗ `click`, `Signup`, `page-view`, `didTapButton`

The SDK sends whatever you write; the server **normalizes** (camelCase/dashes/spaces → snake_case, recording `$original_name`) and **validates**. `validationMode: "strict"` rejects violations; `"warn"` (default) stores them flagged so the Data Quality view and the weekly `taxonomy-review` workflow can drive cleanup without losing data.

Reserved names: `event`, `distinct_id`, `token`, `time`. Pseudo-events start with `$` (`$identify`) and are handled by the platform, not stored as product events.

## Property conventions

- keys: `snake_case`, match `^[a-z$][a-z0-9_]*$`; values ≤ 32KB total per event
- money: numeric `revenue` + string `currency` ("USD"), never "$49"
- booleans as booleans, not "yes"/"no"; timestamps as ISO strings
- prefer flat properties over nesting — they group/segment better

## Automatic taxonomy

Every ingested event upserts `event_taxonomy`:

- `object`/`action` split from the name
- `category` auto-classified (acquisition / activation / engagement / revenue / retention) via keyword heuristics, refined weekly by the AI `taxonomy-review` workflow
- `property_schema` inferred incrementally from observed payloads (type per key)
- volume + first/last seen for lifecycle decisions

## Governance lifecycle

```
active ──(rename/dedupe suggestion accepted)──▶ deprecated ──▶ blocked
```

- **deprecated**: still ingested; dashboard shows a strikethrough + the replacement.
- **blocked**: rejected at ingestion regardless of mode — use for spammy or accidentally-shipped events.

## Starter taxonomy (recommended minimum)

| Event | Category | Key properties |
|---|---|---|
| `user_signed_up` | acquisition | `method`, `utm_*` via context |
| `onboarding_completed` | activation | `steps_completed` |
| `session_started`* | retention | (automatic via sessionization) |
| `<feature>_used` per core feature | engagement | feature-specific |
| `checkout_started` / `checkout_completed` | revenue | `revenue`, `currency`, `plan` |
| `subscription_cancelled` | retention | `reason` |

*You don't need to track `session_started` manually — sessions are derived server-side; listed for mental model only.
