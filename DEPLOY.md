# Deploying WebGrades to S3 + CloudFront

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
