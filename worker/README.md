# `golf-pickem-weekly` Worker

This folder is a source-controlled mirror of the Cloudflare Worker currently called by the frontend.

## Important

- Production Worker name: `golf-pickem-weekly`
- Production URL: `https://golf-pickem-weekly.hiattgafnea0.workers.dev`
- KV binding: `PICKS_KV`
- Secret binding: `ADMIN_KEY` (configured in Cloudflare; never commit its value)
- `compatibility_date` intentionally matches the current deployed Worker. Treat any update as a separate tested runtime change.

The unrelated Worker route `api.oneanddone.cloud/*` points at `twilight-tree-42ce`; do not deploy this source there.

## Local Commands

```sh
npm install
npm run dev
npm run check
```

Use a local-only `.dev.vars` file when testing admin operations:

```text
ADMIN_KEY=local-test-value
```

## Production Deployment Checklist

1. Confirm the intended diff in `src/index.js`.
2. Confirm the production target is `golf-pickem-weekly`.
3. Confirm `PICKS_KV` and the existing `ADMIN_KEY` binding remain present.
4. Deploy explicitly from this folder.
5. Verify `/status`, `/weeks`, and the affected API behavior after deployment.

