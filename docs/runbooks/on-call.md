# On-Call Runbook

## On-Call Responsibilities

The on-call engineer is the **first point of contact** for production incidents during their rotation. Their responsibilities are:

1. **Acknowledge** alerts within the response time SLA (see below).
2. **Triage** the incident using the Admin Health Dashboard and Error Monitor.
3. **Contain** the impact using the tools available (rollback, feature flag, IP block, maintenance mode).
4. **Escalate** to the engineering lead if the incident cannot be resolved within 30 minutes.
5. **Communicate** status to stakeholders at regular intervals.
6. **Hand off** cleanly at the end of the rotation.

---

## How Alerts Arrive

| Channel | Source | What it means |
|---|---|---|
| **Email** | Health monitor (if `integration_email=on` and `smtp_admin_alert_email` configured in Admin Settings) | A critical health check failed: DB down, malformed moderation config, etc. |
| **Slack** | Health monitor webhook (if `health_alert_slack_webhook` configured in Admin Settings) | Same as above, delivered to the configured Slack channel |
| **Sentry** | Sentry project alert rules | Unhandled exceptions, error rate spikes, performance degradation |
| **Admin Error Monitor** | In-app badge on sidebar | New error reports submitted by rider/vendor/customer apps (HMAC-verified) |
| **Direct user report** | Customer support / stakeholder message | Anecdotal report; requires manual verification |

> Configure alert channels in **Admin panel → Settings → Integrations / System Performance** by setting `integration_email=on`, `smtp_admin_alert_email`, and optionally `health_alert_slack_webhook`.

---

## Response Time Expectations

| Severity | Acknowledge | First status update | Resolution target |
|---|---|---|---|
| **P1 — Critical** | ≤ 15 minutes | ≤ 30 minutes | ≤ 2 hours |
| **P2 — High** | ≤ 30 minutes | ≤ 1 hour | ≤ 4 hours |
| **P3 — Medium** | ≤ 2 hours | ≤ 4 hours | ≤ 24 hours |
| **P4 — Low** | Next business day | — | Next sprint |

Outside business hours: P1 and P2 require immediate response regardless of time. P3 and P4 can wait until the next working day.

---

## Immediate Response Checklist

When you receive a P1 or P2 alert:

- [ ] Open `/admin/health-dashboard` — check DB, GPS, moderation, feature flags.
- [ ] Check `/api/health` and `/api/healthz` — is the API responding?
- [ ] Open `/admin/error-monitor` — are there new HMAC-verified error reports?
- [ ] Check the Replit workflow logs — is the API server running without crashes?
- [ ] Classify severity (P1–P4) using [`incident-response.md`](./incident-response.md).
- [ ] Post acknowledgement in the team Slack channel.
- [ ] Begin containment / resolution steps.

---

## Escalation Path

| Condition | Escalate to |
|---|---|
| Cannot reproduce or identify root cause within 30 min | Engineering Lead |
| Root cause identified but fix requires code change and access is limited | Engineering Lead + developer with merge access |
| Database data loss or corruption suspected | Engineering Lead + Neon support |
| Security incident (unauthorized access, data breach suspected) | Engineering Lead + company security contact immediately |
| Escalation unresponsive after 15 min | Skip to next level (CTO / project owner) |

---

## Handoff Procedure

At the end of each on-call rotation, hand off to the incoming engineer:

1. **Status summary** — is there an active incident? What's its state?
2. **Recent incidents** — any P1/P2 from the past 24 hours that need follow-up?
3. **Known issues** — P3/P4 in progress; any flaky health checks or noisy alerts?
4. **Pending actions** — post-incident action items assigned to on-call.
5. **Access check** — confirm the incoming engineer has Admin panel access and Sentry access.

Handoff message template (Slack):

```
🔄 On-call handoff to @[incoming]

Active incidents: [none / describe]
Recent P1/P2: [none / link to post-incident doc]
Known issues: [list or "none"]
Pending action items: [list or "none"]
Alerts configured: Email ✅ / Slack ✅ (check Admin → Settings if unsure)
```

---

## Quick Reference Links

| Resource | URL |
|---|---|
| Health Dashboard | `/admin/health-dashboard` |
| Error Monitor | `/admin/error-monitor` |
| Audit Logs | `/admin/audit-logs` |
| Security Logs | `/admin/security` |
| App Management (feature flags) | `/admin/app-management` |
| API Docs (Swagger UI) | `/api/docs` |
| API Health | `/api/health` |
| Deployment runbook | `docs/runbooks/deployment.md` |
| Rollback runbook | `docs/runbooks/rollback.md` |
| Incident Response runbook | `docs/runbooks/incident-response.md` |
