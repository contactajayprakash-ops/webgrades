# Deploying WebGrades

Two hosts, one push. `main` deploys to both:

| Host | URL | API path |
|---|---|---|
| CloudFront + S3 | `diatjuqtrbl82.cloudfront.net` | same-origin `/api`, proxied server-side |
| Firebase Hosting | `webgrades.firebaseapp.com` | cross-origin to CloudFront's `/api` |

Firebase also serves the same site at `webgrades.web.app`, but that domain is
blocked on the school network - use `firebaseapp.com` there.

## Why CloudFront is required (not just S3)

`src/api/hac.js` calls same-origin paths (`/api/login`, `/api/data`) so the HAC
backend URL never lands in the client bundle or the browser's network tab.
That needs a server-side proxy. Vercel did it with `vercel.json`. Plain S3
static hosting **cannot** — it has no rewrite engine, so every API call would
404. CloudFront supplies both the proxy and SPA routing.

## Architecture

```
                        CloudFront distribution
browser ──────────────► ├─ default behavior  ──► S3 bucket (private, OAC)
                        │    fn: spa-rewrite.js   extensionless URI -> /index.html
                        │
                        └─ /api/*  behavior ──► gyatsigma.taile915cc.ts.net
                             fn: api-strip.js    /api/login -> /login
```

## One-time AWS setup

**1. S3 bucket** — region `us-east-2`, Block Public Access **on** (CloudFront
reaches it through OAC, not the public internet). No static website hosting
needed.

**2. CloudFront distribution**

Origin 1 — the bucket:
- Origin access: **Origin access control settings (recommended)**, create a new
  OAC. Afterwards CloudFront shows a bucket policy to copy into S3.

Origin 2 — the HAC backend:
- Origin domain: `gyatsigma.taile915cc.ts.net`
- Protocol: **HTTPS only**

Default behavior (origin 1):
- Viewer protocol policy: Redirect HTTP to HTTPS
- Cache policy: `CachingOptimized`
- Function association → Viewer request → `spa-rewrite`

Behavior for `/api/*` (origin 2), precedence 0:
- Allowed methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
- Cache policy: **`CachingDisabled`**
- Origin request policy: **`AllViewerExceptHostHeader`**
- Function association → Viewer request → `api-strip`

> `AllViewerExceptHostHeader` matters. Tailscale Funnel routes on the Host
> header; forwarding the CloudFront hostname instead would break it.

**3. CloudFront Functions** — create two, paste from `cloudfront/`, publish
both, then attach them to the behaviors above.

**4. Do NOT add distribution-level custom error responses** for 404/403. They
apply to every behavior, so API errors would come back as the HTML shell.
The SPA function handles routing instead.

## GitHub Actions

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.

Repo secrets required (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from the deploy IAM user |
| `AWS_SECRET_ACCESS_KEY` | from the deploy IAM user |
| `S3_BUCKET` | bucket name, no `s3://` |
| `CLOUDFRONT_DISTRIBUTION_ID` | e.g. `E1A2B3C4D5E6F7` |

IAM policy for the deploy user — scoped to just this bucket and distribution:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/*"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudfront:CreateInvalidation"],
      "Resource": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/YOUR_DIST_ID"
    }
  ]
}
```

## Caching

Hashed assets get `max-age=31536000,immutable`. `index.html`, `sw.js`,
`registerSW.js` and `manifest.webmanifest` get `no-store` and are invalidated
on every deploy — without that the PWA service worker keeps serving the old
build after a push.

## Firebase Hosting

Firebase Hosting rewrites can only target a file, a Cloud Function, or Cloud
Run - never an arbitrary external origin. So it cannot proxy `/api` the way
CloudFront's cache behavior does. Instead `npm run build:firebase` sets
`VITE_API_BASE` to CloudFront's absolute `/api` URL and the calls go
cross-origin; the HAC backend answers preflights with
`Access-Control-Allow-Origin: *`, so no server change was needed.

That means **CloudFront stays load-bearing even for the Firebase site** - it is
the API proxy. Don't delete the distribution.

### CI credential

The `firebase` job needs one repo secret:

| Secret | How to create |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_WEBGRADES` | `firebase init hosting:github` - creates the service account and uploads the secret for you |

### Deploying by hand

```bash
npm run deploy:firebase
```

Note this is `firebase-tools`, not `firebase` - the latter is the JS SDK and
ships no executable.
