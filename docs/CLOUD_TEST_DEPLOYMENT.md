# Free Cloud Test Deployment

This guide deploys a **test/demo instance**, not a production library system. The suggested setup is Render's free Node web service plus a Neon Free PostgreSQL database. Check provider pricing and limits again before use; free tiers can change.

## Free tier limits

- Render free web services sleep after 15 minutes without traffic and can take around a minute to wake. They have 750 free instance hours per workspace/month.
- Render free web-service files are ephemeral. Uploaded cover files can disappear after a restart, sleep or redeploy; this setup stores them under `/tmp` and must not be used for important covers.
- Neon Free currently includes 1 GB PostgreSQL storage, 100 compute hours/project/month and scales idle compute to zero. It has no scheduled backups on the free plan. Export data you need to keep.
- Do not enter real patron information or rely on this free test deployment as the library's permanent system. Use paid persistent storage, backups, monitoring and a reviewed security setup for production.
- OCR is disabled in this blueprint. Google Cloud Vision is optional and may incur charges if configured.

## Before deployment

1. Push this repository to a private GitHub repository. Do not commit `.env` files, API keys, database URLs, passwords or real library data.
2. Create a Neon account and a new PostgreSQL project on the Free plan. Choose a region near the Render service if available.
3. Copy the **direct** PostgreSQL connection string from Neon. Keep it private. The application migrations need the direct database connection.
4. Create an administrator email and a strong password that meets the application's password policy. Do not reuse the local test password.

## Deploy on Render

1. Create a Render account and choose **New > Blueprint**.
2. Connect the private GitHub repository containing `render.yaml`.
3. When prompted, enter the Neon connection string as `DATABASE_URL`, your administrator email, and a new strong `SEED_ADMIN_PASSWORD`. These are entered in Render's secret prompt, not committed to this repository.
4. Review the resources before confirming: the blueprint creates one free public web service. It does **not** create or reset a database.
5. Wait for the service deployment to finish. Render runs migrations and the idempotent development-admin seed at startup.
6. Open the Render `onrender.com` address. Check `/api/v1/health/ready` returns `{"status":"ok","database":"up"}`, then sign in with the administrator account you supplied.

The web app and API are served from one HTTPS origin. This keeps the existing secure cookie authentication and allows phone browsers to request camera permission over HTTPS. Camera operation still depends on permission and physical-device/browser support. Live Google Books, Open Library and OCR calls should be checked separately.

## Data safety

- This test blueprint does not copy local PostgreSQL data to Neon. Start with a new empty cloud test database.
- Never aim the deployment at the local integration-test database. Integration tests run `prisma migrate reset --force` and erase their target.
- Uploaded cover images use Render's temporary filesystem and are not durable here.
- Neon Free has no scheduled backups. Before keeping test records, export them from Neon and store the export somewhere private.
- To remove the test deployment, delete the Render service and Neon test project from their dashboards. Verify each selected resource name before confirming deletion.

## Updating the deployment

Commit and push changes to the linked branch; Render rebuilds the frontend and backend. Keep the Render secrets in its dashboard. If changing `render.yaml`, check the resource plan and database target before syncing so an existing database is not replaced accidentally.
