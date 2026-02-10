# sequence-relayer-status

Dashboard to visualize **Sequence relayer sender balances** across all networks in `@0xsequence/wallet-primitives`.

## How it works

- Uses `@0xsequence/wallet-primitives@3.0.0-beta.13` to enumerate supported networks (`Network.ALL`).
- For each network, queries:
  - `https://{network.name}-relayer.sequence.app/status`
- Aggregates results server-side via **Cloudflare Pages Functions** and renders a UI.

## Local development

```bash
cd web
pnpm install
pnpm dev
```

The dashboard calls `/api/status` (served by Pages Functions). When running locally with Vite, you can either:

1) Deploy preview on Cloudflare Pages (recommended), or
2) Run via `wrangler pages dev`:

```bash
cd web
pnpm install
pnpm build
pnpm dlx wrangler pages dev dist --compatibility-date=2026-02-10 --functions=functions
```

## Cloudflare Pages deploy

Create a Cloudflare Pages project connected to this GitHub repo.

Suggested settings:
- **Framework preset:** Vite
- **Root directory:** `web`
- **Build command:** `pnpm install && pnpm build`
- **Build output directory:** `dist`

No auth for now.

## Notes

- Balance check is intentionally simple: **sender balance > 0 is OK**.
- Some networks may not have a relayer deployment; those show as "Down".
