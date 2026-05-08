# Rollback Runbook

## Overview

This runbook covers how to roll back a bad AJKMart deployment — whether caused by a broken build, a bad migration, or a runtime regression that passes the smoke tests but breaks in production.

---

## Step 1 — Identify a Bad Deployment

Look for any of the following signals:

| Signal | Where to check |
|---|---|
| `/api/health` returns 5xx or times out | `curl https://<domain>/api/health` |
| `/api/healthz` reports `db: "error"` | Admin panel → Health Dashboard |
| Sentry spike (error rate > baseline) | Sentry project dashboard |
| Admin panel → Error Monitor shows new P1/P2 reports | `/admin/error-monitor` |
| Customer / rider / vendor unable to log in | Manual smoke test |
| Workflow console shows unhandled exceptions at boot | Replit workflow logs |

---

## Step 2 — Stop Traffic / Enable Maintenance Mode

If the platform is partially up and causing data corruption, immediately put it in maintenance mode:

1. In the Admin panel → **App Management** → toggle **Maintenance Mode ON**.
2. This shows a maintenance page to all customer-facing traffic while admin access is preserved.

Alternatively, stop the workflow from the Replit UI to take everything offline.

---

## Step 3 — Revert Code via Replit Checkpoint

Replit automatically saves checkpoints at each agent task merge. To revert:

1. Open the Replit workspace.
2. Click the **History** icon in the left sidebar (clock icon).
3. Browse checkpoints by timestamp — find the last known-good one.
4. Click **Restore** on that checkpoint.
5. Confirm the restore; the workspace files will revert to that state.

> After restoring, restart the workflow so the reverted code goes live.

---

## Step 4 — Roll Back a Database Migration

If the bad deployment included a schema migration that needs to be reversed:

### Option A — Undo via Admin System Panel (data-safe, 30-minute window)

The Admin panel → **Settings → System** creates automatic snapshots before destructive actions. If within the 30-minute window, click **Undo** on the snapshot card.

### Option B — Manual Drizzle Migration Rollback

Drizzle ORM does not generate automatic down migrations. To roll back:

1. Identify the last-applied migration in `artifacts/api-server/drizzle/` (highest timestamp).
2. Write a manual SQL rollback script:
   ```sql
   -- example: reverse adding a column
   ALTER TABLE orders DROP COLUMN IF EXISTS new_column;
   ```
3. Run it against the database:
   ```bash
   DATABASE_URL=<your_url> psql -c "ALTER TABLE orders DROP COLUMN IF EXISTS new_column;"
   ```
4. Remove or rename the migration file so Drizzle does not re-apply it.
5. Restart the API server.

### Option C — Restore from Neon Database Snapshot

Neon (the hosted PostgreSQL provider) supports point-in-time restore from the Neon console:

1. Log in to [console.neon.tech](https://console.neon.tech).
2. Select the project → **Branches**.
3. Click **Restore** on the main branch, pick a restore point before the bad migration.
4. Update `DATABASE_URL` in Replit secrets if the endpoint changes.

---

## Step 5 — Restart and Verify

After code or DB rollback:

```bash
node scripts/secure-start.mjs
```

Verify with:

```bash
curl -sf https://<REPLIT_DEV_DOMAIN>/api/health
```

Run the smoke tests from the [deployment runbook](./deployment.md#step-5--smoke-test-each-app).

---

## Step 6 — Communicate the Rollback

Notify stakeholders promptly:

**Internal (Slack / team chat):**
> We detected a regression in the [timestamp] deployment. We have rolled back to the previous stable version. All services are now healthy. A post-incident review will follow.

**Status page / external:**
> We experienced a brief service disruption between [start] and [end]. The issue has been resolved and all services are operating normally.

See [`incident-response.md`](./incident-response.md) for the full communication and escalation protocol.
