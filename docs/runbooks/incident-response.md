# Incident Response Runbook

## Severity Classification

| Severity | Definition | Response time | Example |
|---|---|---|---|
| **P1 — Critical** | Complete service outage; all users affected | Immediate (< 15 min) | API down, DB unreachable, login broken for all users |
| **P2 — High** | Core feature broken; majority of users affected | < 30 min | Orders fail to place, payments failing, rider dispatch down |
| **P3 — Medium** | Degraded experience; subset of users affected | < 2 hours | Push notifications delayed, vendor analytics wrong, slow responses |
| **P4 — Low** | Minor issue; cosmetic or edge-case | Next business day | Wrong label on a button, typo in email, single-user report |

---

## First-Responder Steps

### 1. Detect

Incidents arrive via:
- **Sentry** alert email / notification
- **Health monitor** email or Slack alert (configured in Admin → Settings → health_monitor_enabled)
- **Admin Error Monitor** badge in the admin sidebar (`/admin/error-monitor`)
- User or stakeholder report

### 2. Assess Severity

Open the **Admin Health Dashboard** (`/admin/health-dashboard`):
- Check **Server** section: DB status, uptime, memory usage.
- Check **GPS Tracking**: stale riders, spoof alerts.
- Check **Feature Flags**: any unexpectedly disabled features.
- Check `/api/healthz` for the raw health payload.

Classify as P1–P4 using the table above.

### 3. Engage the On-Call Responder

- For **P1/P2**: immediately contact the on-call engineer (see [`on-call.md`](./on-call.md)).
- For **P3/P4**: create a tracked issue and assign to the next sprint.

### 4. Contain

| Scenario | Containment action |
|---|---|
| API server crash-looping | Restart workflow via Replit UI or shell: `node scripts/secure-start.mjs` |
| DB connection exhausted | Check Neon pooler limits; reduce `DATABASE_URL` pool size or scale Neon plan |
| Bad deployment | Follow [`rollback.md`](./rollback.md) immediately |
| Abusive traffic / DDoS | Block offending IPs via Admin → Security → Blocked IPs |
| Feature regression | Disable feature flag in Admin → App Management, then investigate |
| Out-of-control rate-limit lockouts | Admin → Health Dashboard → Login Security → Unlock affected accounts |

### 5. Investigate

Collect information:
1. **Workflow logs** — Replit → Start application workflow console.
2. **Sentry** — filter by environment and time of incident.
3. **Admin Error Monitor** (`/admin/error-monitor`) — triage new error reports by severity.
4. **Database** — run `pnpm --filter @workspace/db run migrate` to check migration state; query Neon console for slow queries.
5. **Audit log** (`/admin/audit-logs`) — check recent admin actions that may have triggered the issue.

### 6. Resolve

Apply the appropriate fix:
- Code fix → deploy via normal workflow restart.
- Config fix → update platform setting in Admin panel; changes take effect within 30 seconds (cached TTL).
- DB fix → apply manual SQL or Drizzle migration rollback (see [`rollback.md`](./rollback.md)).

### 7. Verify

After resolution, confirm all systems are healthy:

```bash
curl -sf https://<REPLIT_DEV_DOMAIN>/api/health
```

- Run full smoke tests: Admin login, vendor login, rider login, customer app load, place test order if safe.
- Monitor `/admin/health-dashboard` for 15 minutes after resolution.

### 8. Communicate

**During P1/P2 incidents — status update every 15 minutes:**

> **[HH:MM UTC] Investigating** — We are aware of an issue affecting [service]. Our team is actively investigating. Next update in 15 minutes.

> **[HH:MM UTC] Identified** — We have identified the cause: [brief description]. We are applying a fix now.

> **[HH:MM UTC] Resolved** — The issue has been resolved. All services are operating normally. Impact duration: [X] minutes.

**Internal Slack template:**
> 🔴 **P1 INCIDENT** | Started: [time] | Impact: [description] | Owner: [name] | Status: [investigating/fixing/resolved]

---

## Post-Incident Review

For all P1 and P2 incidents, conduct a blameless post-incident review within 48 hours:

**Template:**

```
Date: YYYY-MM-DD
Incident severity: P1 / P2
Duration: X minutes
Impact: N users affected; services affected

Timeline:
  HH:MM — [event]
  HH:MM — [event]

Root cause: [concise description]

Contributing factors: [list]

What went well: [list]

What went wrong: [list]

Action items:
  [ ] Owner: [task] — Due: [date]
```

File the post-incident document in the team wiki or as a GitHub issue tagged `post-incident`.

---

## Key Admin Tools During an Incident

| Tool | URL | Use |
|---|---|---|
| Health Dashboard | `/admin/health-dashboard` | Overall system status, GPS, moderation, feature flags |
| Error Monitor | `/admin/error-monitor` | Real-time error reports from all apps |
| Audit Logs | `/admin/audit-logs` | Recent admin actions |
| Security Logs | `/admin/security` | Auth events, blocked IPs, lockouts |
| Live Riders Map | `/admin/live-riders-map` | GPS health during ride incidents |
| API Docs | `/api/docs` | Test endpoints directly (admin auth required) |
