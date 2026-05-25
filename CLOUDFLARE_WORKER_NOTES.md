# Cloudflare Worker Notes

Use this file to orient future Codex sessions before changing anything in Cloudflare.

## Source-Controlled Workspace

The canonical local checkout for website and Worker changes is:

```text
/Users/hiattgafnea/Desktop/OneDoneWebsite
```

The deployed Worker source has been captured in:

```text
worker/src/index.js
worker/wrangler.jsonc
```

Always compare that source with the live Cloudflare Worker before deploying backend changes, in case the dashboard was edited after the latest git commit.

## What The Site Uses

The public site is:

- `https://oneanddone.cloud`
- Hosted by GitHub Pages
- Proxied through Cloudflare DNS
- Frontend JavaScript calls the Worker directly at:
  - `https://golf-pickem-weekly.hiattgafnea0.workers.dev`

The local and deployed `app.js` should contain:

```js
const CF_BASE = "https://golf-pickem-weekly.hiattgafnea0.workers.dev";
```

That means Worker/API changes should target the Cloudflare Worker named:

```text
golf-pickem-weekly
```

## Cloudflare Account And Zone

Known Cloudflare account:

```text
Account name: Hiattgafnea0@gmail.com's Account
Account ID: 68f4dbe8fd937753ac3fe7e64f4c071d
```

Known Cloudflare zone:

```text
Domain: oneanddone.cloud
Zone ID: e2f91c8563d34929cce7d0cc53eb5f8d
```

DNS observed for `oneanddone.cloud`:

- Apex `oneanddone.cloud` has proxied GitHub Pages A records.
- `www.oneanddone.cloud` is a proxied CNAME to `sqoax.github.io`.
- `www.oneanddone.cloud` redirects to `https://oneanddone.cloud/`.

## Correct Worker Details

Worker name:

```text
golf-pickem-weekly
```

Expected characteristics:

- Has a `fetch` handler.
- Uses module Worker format.
- Has a KV binding named `PICKS_KV`.
- Has a secret named `ADMIN_KEY`.
- Workers.dev subdomain is enabled.
- Latest known compatibility date: `2024-01-01`.
- Last observed deployment source: Cloudflare dashboard/quick editor.

Expected public API endpoints:

- `GET /status`
- `GET /weeks`
- `GET /picks?week=<week-number>`
- `POST /submit`
- `POST /admin`

Before changing the Worker, confirm it is alive:

```sh
curl -sS https://golf-pickem-weekly.hiattgafnea0.workers.dev/status
curl -sS https://golf-pickem-weekly.hiattgafnea0.workers.dev/weeks
```

## Important Warning

There is another Worker in the account:

```text
twilight-tree-42ce
```

Cloudflare has or had a route:

```text
api.oneanddone.cloud/*
```

That route points to `twilight-tree-42ce`, not `golf-pickem-weekly`.

As of the last check, `api.oneanddone.cloud` did not resolve, and the live site did not use it. Do not edit `twilight-tree-42ce` when trying to change the O&D app backend unless the user explicitly asks to fix or migrate the custom API route.

## How To Confirm With Cloudflare MCP

Use the Cloudflare API connector, then check:

1. List Workers:

```js
async () => {
  return cloudflare.request({
    method: "GET",
    path: `/accounts/${accountId}/workers/scripts`
  });
}
```

2. Inspect the correct Worker settings:

```js
async () => {
  return cloudflare.request({
    method: "GET",
    path: `/accounts/${accountId}/workers/scripts/golf-pickem-weekly/settings`
  });
}
```

3. Inspect deployments:

```js
async () => {
  return cloudflare.request({
    method: "GET",
    path: `/accounts/${accountId}/workers/scripts/golf-pickem-weekly/deployments`
  });
}
```

4. Download Worker content:

```js
async () => {
  return cloudflare.request({
    method: "GET",
    path: `/accounts/${accountId}/workers/scripts/golf-pickem-weekly/content/v2`
  });
}
```

5. Check zone Worker routes if custom domain API behavior matters:

```js
async () => {
  const zoneId = "e2f91c8563d34929cce7d0cc53eb5f8d";
  return cloudflare.request({
    method: "GET",
    path: `/zones/${zoneId}/workers/routes`
  });
}
```

## Safe Change Process

When changing backend behavior:

1. Confirm `app.js` still points to `golf-pickem-weekly.hiattgafnea0.workers.dev`.
2. Download and inspect the current `golf-pickem-weekly` Worker code.
3. Preserve existing bindings:
   - `PICKS_KV`
   - `ADMIN_KEY`
4. Make the smallest possible Worker change.
5. Deploy only to `golf-pickem-weekly`.
6. Test the affected endpoint directly with `curl`.
7. Test the live site behavior at `https://oneanddone.cloud`.

Frontend changes go through GitHub Pages. Worker/API changes go through Cloudflare.
