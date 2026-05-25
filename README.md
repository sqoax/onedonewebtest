# One & Done League

Mobile-first golf pool site for the O&D league.

## Production Setup

- Website: `https://oneanddone.cloud`
- Frontend host: GitHub Pages from this repository
- Custom domain: preserved through `CNAME`
- Backend API: Cloudflare Worker `golf-pickem-weekly`
- Live API base URL: `https://golf-pickem-weekly.hiattgafnea0.workers.dev`
- Historical/stat data: published Google Sheets CSV feeds referenced in `app.js`

## Working Locally

Use this repository checkout as the source of truth:

```text
/Users/hiattgafnea/Desktop/OneDoneWebsite
```

Serve the frontend locally:

```sh
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765/index.html`.

## Publishing Frontend Changes

1. Make frontend edits in this repository, not in loose exported copies.
2. Test locally, including the affected navigation and forms.
3. Review `git diff` and commit only intended files.
4. Push a branch and merge it into `main`.
5. Verify `https://oneanddone.cloud` after GitHub Pages deploys.

Do not remove or overwrite `CNAME`; it controls the custom site domain.

## Cloudflare Worker

The current deployed Worker source is mirrored under `worker/` so backend changes can be versioned before deployment. Read `CLOUDFLARE_WORKER_NOTES.md` before changing or deploying Worker code.

Worker changes are separate from GitHub Pages frontend changes:

```sh
cd worker
npm install
npx wrangler dev
```

Never commit an admin key. For local development only, create `worker/.dev.vars` with an `ADMIN_KEY` value. Before any production deployment, verify that the target is `golf-pickem-weekly`, confirm its bindings, and test the live endpoints afterward.

