# GitHub and DigitalOcean deployment (no Docker)

This is a reviewed **target configuration**, not an executed deployment. The user selected GitHub source and a DigitalOcean droplet. Go is the only runtime API; Nginx serves the compiled React frontend. MongoDB remains Atlas. No container runtime, Node API, or MongoDB service belongs on the production droplet.

## Before deployment

Supply the intended GitHub repository/remote, droplet/SSH access, domain and TLS configuration. Complete the release checklist and request explicit operator authorization for public deployment. Current production configuration supports public discovery only; authenticated workflows return 503 pending live auth/MFA/guardian work. Do not expose `APP_ENV=development` or the sample database on the public internet.

Review a supported Linux droplet image, sizing, firewall/SSH policy, backups and monitoring with the operator. Install Nginx and systemd service configuration using a non-root deployment account plus limited sudo. The application user `tutor` should have no login shell. Only 80/443 and approved SSH access should be reachable; Go binds `127.0.0.1:8080`.

## Build and release layout

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
APP_NAME=Tutor Platform
HTTP_ADDR=127.0.0.1:8080
WEB_ORIGIN=https://your-reviewed-domain.example
MONGODB_URI=<private Atlas SRV connection>
MONGODB_DATABASE=<separate reviewed production database>
AUTH_PROVIDER=disabled
PAYMENT_PROVIDER=disabled
TRIAL_FEE_PAISE=0
```

Do not put secrets in `VITE_*`, deployment logs, shell history or frontend artifacts. Use a separate restricted Atlas database user for the running application; migration credentials may temporarily need collection/index privileges. Restrict the Atlas network access list to the droplet's approved egress IP. Keep Atlas TLS verification enabled. The test database credentials are not automatically approved production credentials.

Install the reviewed `infra/tutor-api.service`, provide the environment file, and validate its resolved paths. For an authorised release: run the idempotent `tutor-migrate` binary with the same private environment, switch the `current` symlink to the release, then `systemctl daemon-reload` and `systemctl restart tutor-api`. Never run the sample seed in production. These operator commands have **not** been run on a droplet.

Replace the example domain/certificate paths in `infra/nginx.conf`. Obtain a valid TLS certificate using the operator-approved mechanism; then run `nginx -t` before enabling/reloading the site. The proxy preserves `/api/v1`. HTML is not cached indefinitely, private API responses use `no-store`, hashed assets can be cached, and no public service worker stores private pages. Headers limit embedding, location/camera use and cross-origin scripts. The template is not a security certification.

### Additional services for the new workflows

The Go process also runs the persisted job worker. Multiple instances can contend for jobs using MongoDB leases; no Node worker or extra application API is needed. Application startup does not run migrations automatically. Resolve the reported Atlas collection limit before installing this extension, then run the reviewed migration explicitly. The private development environment has not been changed and the latest extension has only been verified on the isolated local replica set.

Keep `MEDIA_PROVIDER=disabled` until private storage is ready. The optional `disk` adapter is development-only and requires an absolute directory outside public assets. Staging/production files use an operator-configured private S3-compatible bucket; see [private-files.md](private-files.md) for endpoint, bucket, credential and ClamAV settings. Run ClamAV separately with loopback-only access, current signatures and resource limits; no Docker is required. The Nginx request limit is 5 MiB for the 3 MiB base64 file envelope, while Go retains smaller limits on other routes. Files remain quarantined if scanning is unavailable. An actual bucket/scanner/restore exercise is still required.

Razorpay sandbox configuration uses backend-only test keys and a separate webhook secret; see [payments.md](payments.md). The currently supplied Nginx CSP intentionally does not permit hosted checkout. Verify the provider's actual script/frame/connect requirements on an authorised HTTPS staging origin before changing it. Do not weaken the CSP to a wildcard or enable live payments merely because the merchant account is approved. Production payment activation remains blocked in code.

`tutor-staff` provisions an audited staff identity with a hidden terminal password; it neither sends an invitation nor bypasses the production MFA gate. Run it only under the reviewed operator procedure in [staff-provisioning.md](staff-provisioning.md). Staff bootstrap credentials are never frontend configuration or default sample passwords.

## Verify and rollback

After authorization and deployment, verify TLS, `/api/v1/health`, `/api/v1/ready`, hard reloads on routed URLs, actual Secure/HttpOnly cookies once live auth exists, Origin/CSRF handling, both languages, private cache isolation, mobile performance and operator workflows. Never publish sample identities as genuine tutor credentials. Re-run browser and access tests against a separate staging database first.

Retain the previous application release for a reversible symlink rollback. Do not automatically reverse schema/data migrations; review compatibility and restore strategy before each migration. Health failures should alert an operator without logging credentials or learner details.

## Backup/restore gate

Configure an Atlas backup policy appropriate to the chosen tier, retention and operator/legal requirements. An operator must perform and record a restore rehearsal into a **separate isolated database/cluster**, validate ownership indexes, consents, trial/learning records and session revocation, and agree recovery objectives before launch. No backup or restore has been performed here; availability depends on the actual Atlas arrangement. Never overwrite production during a rehearsal.

Primary references checked: [DigitalOcean SSH access](https://docs.digitalocean.com/products/droplets/how-to/connect-with-ssh/), [Nginx proxy module](https://nginx.org/en/docs/http/ngx_http_proxy_module.html), [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/). Exact deployment remains an operator-reviewed activity.
