# GitHub and DigitalOcean deployment (no Docker)

This is a reviewed **target configuration**, not an executed deployment. The user selected GitHub source and a DigitalOcean droplet. Go is the only runtime API; Nginx serves the compiled React frontend. MongoDB remains Atlas. No container runtime, Node API, or MongoDB service belongs on the production droplet.

## Before deployment

Supply the intended GitHub repository/remote, droplet/SSH access, domain or supported IP TLS configuration. Deploy within the operator-authorized scope. Explicit `AUTH_PROVIDER=password` enables parent/tutor signup and login plus provisioned non-sample staff password login in production; omitted/disabled authentication remains closed. The operator opted for password-only staff access; minor guardian verification and real payments remain separate gates. See [production authentication](production-auth.md). Do not expose `APP_ENV=development` or the sample database on the public internet.

Review a supported Linux droplet image, sizing, firewall/SSH policy, backups and monitoring with the operator. Install Nginx and systemd service configuration using a non-root deployment account plus limited sudo. The application user `tutor` should have no login shell. Only 80/443 and approved SSH access should be reachable; Go binds `127.0.0.1:8080`.

## Build and release layout

Asset retention (2026-10-09): `deploy-existing.sh` uses `scripts/stage-release-assets.py` to stage hashed bundles and write `ASSET_RETENTION.json` in each new release. Assets retired from the current build remain available for 30 days; already-retired bundles do not accumulate indefinitely in new releases. A release without a manifest receives a full migration grace period. The script does not delete any existing release directory or rollback artifact. Review actual disk usage and current/rollback targets before authorizing historical release deletion. Tabs older than the compatibility window may require a refresh. Logo/hero URLs in new builds are hashed and use the existing `/assets/` cache configuration; no Nginx change is needed for them.

### GoCoaching rebrand (2026-10-08)

Before deploying this release, set `APP_NAME=GoCoaching` and `WEB_ORIGIN=https://gocoaching.in` in the existing `/etc/tutor/api.env`. The deploy script validates both before building. It does not rewrite private environment settings. Update the active Nginx domain/certificate configuration separately; the reviewed template now uses `gocoaching.in` and redirects `www.gocoaching.in` to the apex so account requests have the exact configured Origin. Obtain a certificate covering both names first. Validate `nginx -t` on the droplet before reloading.

Keep the existing `tutor-api` service, `/srv/tutor` release layout, deployment lock, backup directory, MongoDB database and session identifiers. The old Nginx filename may remain `thegyansetu`; its server names and certificate paths determine the public domain. Users sign in again on the new domain. Update any configured provider webhook/callback URLs in their respective dashboards to the new HTTPS domain; this source change does not alter provider accounts or saved business/legal invoice identities. Historical records and documentation evidence are retained.

For the existing `gocoaching.in` droplet, `sudo bash scripts/deploy-existing.sh` from a checkout of the reviewed commit builds and activates an update. The operator explicitly authorized this GitHub push and requested the deployment command on 2026-09-25. The script requires the existing `/srv/tutor/current` release symlink, `tutor-api` service, HTTPS origin and password-auth production environment. It builds in a fresh release directory with limited concurrency, retains the previous release and hashed frontend assets, atomically switches the symlink and verifies HTTPS readiness, production configuration and the served frontend. Activation/check failures attempt to restore the previous release. It does not edit Nginx, certificates or `/etc/tutor/api.env`, seed accounts or reset data. Before activation, it runs the additive `tutor-migrate --inbox-only` and `tutor-migrate --finance-only` tasks through systemd with the existing private environment and the user/group configured on `tutor-api` (validated before building). Migration failure leaves the running release unchanged; rollback preserves the new inbox and finance collections. The finance scope creates validators and unique payout-reference/invoice indexes without rewriting existing records; see [Finance workflows](finance.md). See [Updates inbox and migration](updates-inbox.md). Actual droplet execution must still be verified from operator output.

`bash scripts/build-release.sh` builds a Linux artifact locally/on CI into `.local/release`. It does not publish it. Build for the droplet's CPU architecture. Node is only needed on the build machine.

```text
/srv/tutor/releases/<reviewed-commit>/tutor-api
/srv/tutor/releases/<reviewed-commit>/tutor-migrate
/srv/tutor/releases/<reviewed-commit>/tutor-staff
/srv/tutor/releases/<reviewed-commit>/web/index.html
/srv/tutor/releases/<reviewed-commit>/web/assets/...
/srv/tutor/current -> releases/<reviewed-commit>
/etc/tutor/api.env  # root:tutor, 0640, never in Git or web root
```

Use GitHub checkout/build artifacts tied to a reviewed commit; never run arbitrary pull-request artifacts with deployment secrets. CI runs tests but has no automatic deployment job or Atlas production credentials.

Production backend environment must include:

```dotenv
APP_ENV=production
APP_NAME=GoCoaching
HTTP_ADDR=127.0.0.1:8080
WEB_ORIGIN=https://your-reviewed-domain.example
MONGODB_URI=<private Atlas SRV connection>
MONGODB_DATABASE=<separate reviewed production database>
AUTH_PROVIDER=password
PAYMENT_PROVIDER=disabled
TRIAL_FEE_PAISE=0
```

Do not put secrets in `VITE_*`, deployment logs, shell history or frontend artifacts. Use a separate restricted Atlas database user for the running application; migration credentials may temporarily need collection/index privileges. Restrict the Atlas network access list to the droplet's approved egress IP. Keep Atlas TLS verification enabled. The test database credentials are not automatically approved production credentials.

Install the reviewed `infra/tutor-api.service`, provide the environment file, and validate its resolved paths. For an authorised release: run the idempotent `tutor-migrate` binary with the same private environment, switch the `current` symlink to the release, then `systemctl daemon-reload` and `systemctl restart tutor-api`. Never run the sample seed in production. These operator commands have **not** been run on a droplet.

Replace the example domain/certificate paths in `infra/nginx.conf`. Obtain a valid TLS certificate using the operator-approved mechanism; then run `nginx -t` before enabling/reloading the site. The proxy preserves `/api/v1`. HTML is not cached indefinitely, private API responses use `no-store`, hashed assets can be cached, and no public service worker stores private pages. Headers limit embedding, location/camera use and cross-origin scripts. The template is not a security certification.

### Additional services for the new workflows

The Go process also runs the persisted job worker. Multiple instances can contend for jobs using MongoDB leases; no Node worker or extra application API is needed. Application startup does not run migrations automatically. Resolve the reported Atlas collection limit before installing this extension, then run the reviewed migration explicitly. The private development environment has not been changed and the latest extension has only been verified on the isolated local replica set.

For the selected Cloudinary deployment, set `MEDIA_PROVIDER=cloudinary`, `VIDEO_PROVIDER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `/etc/tutor/api.env`. Set `MEETING_PROVIDER=zoom` with the four Zoom settings in `.env.example`. Do not configure/install ClamAV for Cloudinary: browser uploads go directly to Cloudinary and Go verifies provider metadata before saving ready references. Remove `CLAMAV_ADDRESS` from this deployment's environment. Existing production authentication/payment restrictions remain independent.

Use the updated Nginx CSP: browser uploads require `connect-src https://api.cloudinary.com`; image/video delivery allows the exact Cloudinary API and media domains. No wildcard sources are required. Documents and videos remain authenticated assets, with five-minute signed viewing/download URLs issued after access checks. Do not copy their delivery URLs into public pages or logs. See [private-files.md](private-files.md) for the upload/confirmation flow and account delivery checks.

The old disk adapter is development-only. Legacy S3 deployments still require a loopback scanner. The 35 MiB Nginx envelope limit applies to legacy API uploads; direct Cloudinary uploads do not send file bytes through Nginx or Go. No existing disk/S3 object is migrated or deleted automatically.

Razorpay sandbox configuration uses backend-only test keys and a separate webhook secret; see [payments.md](payments.md). The currently supplied Nginx CSP intentionally does not permit hosted checkout. Verify the provider's actual script/frame/connect requirements on an authorised HTTPS staging origin before changing it. Do not weaken the CSP to a wildcard or enable live payments merely because the merchant account is approved. Production payment activation remains blocked in code.

`tutor-staff` provisions an audited staff identity with a hidden terminal password; it sends no invitation. The operator chose password-only staff login; a provisioned non-sample account can sign in when AUTH_PROVIDER=password. Run it only under the reviewed operator procedure in [staff-provisioning.md](staff-provisioning.md). Staff bootstrap credentials are never frontend configuration or default sample passwords.

## Verify and rollback

Current-location controls require `Permissions-Policy: geolocation=(self), camera=(), microphone=()`. The old `geolocation=()` directive blocks location access even when a user grants browser permission. Update the active HTTPS server block from the reviewed Nginx template, run `sudo nginx -t`, then `sudo systemctl reload nginx` after operator authorization. Verify the header on an HTML document with `curl -I https://gocoaching.in/` and reload the browser page. `scripts/deploy-existing.sh` deliberately does not update Nginx, so an application restart or release alone does not apply this correction. HTTPS and browser location permission remain required.

Address autofill uses the existing server-side `GOOGLE_MAPS_API_KEY` with the Google Geocoding API enabled and permitted for the server. Keep it in `/etc/tutor/api.env`, never a `VITE_*` variable. The provider must be configured for current-location lookup; errors do not fall back to another provider or save a fabricated address. See [Google reverse-geocoding parameters](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-reverse-geocoding). No Maps account provisioning or billing change is performed by deployment.

For this correction, run `sudo python3 scripts/enable-geolocation.py` on the droplet after the application deployment. It identifies the active GoCoaching config from `nginx -T`, rejects ambiguous/shared-domain or unexpected policies, backs up the file under `/var/backups/gyansetu-nginx`, changes only the known geolocation directive, validates and reloads Nginx. A failed update restores the previous config; an already-correct policy is validated and reloaded without rewriting it. The helper does not modify TLS, camera/microphone restrictions, API settings or data. Local isolated checks: `python scripts/test_enable_geolocation.py`.

After authorization and deployment, verify TLS, `/api/v1/health`, `/api/v1/ready`, `/api/v1/config` (`authEnabled: true`), hard reloads on routed URLs, Secure/HttpOnly cookies, Origin/CSRF handling, English interface, private cache isolation, mobile performance and operator workflows. Keep `proxy_set_header X-Forwarded-For $remote_addr` in Nginx: the API trusts only one IP supplied by its loopback proxy, never an appended client-supplied chain. Never publish sample identities as genuine tutor credentials. Re-run browser and access tests against a separate staging database first.

Retain the previous application release for a reversible symlink rollback. Do not automatically reverse schema/data migrations; review compatibility and restore strategy before each migration. Health failures should alert an operator without logging credentials or learner details.

## Backup/restore gate

Configure an Atlas backup policy appropriate to the chosen tier, retention and operator/legal requirements. An operator must perform and record a restore rehearsal into a **separate isolated database/cluster**, validate ownership indexes, consents, trial/learning records and session revocation, and agree recovery objectives before launch. No backup or restore has been performed here; availability depends on the actual Atlas arrangement. Never overwrite production during a rehearsal.

Primary references checked: [DigitalOcean SSH access](https://docs.digitalocean.com/products/droplets/how-to/connect-with-ssh/), [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/). Exact deployment remains an operator-reviewed activity.
