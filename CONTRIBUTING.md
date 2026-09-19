# Contributing

## Running it locally

No external accounts needed:

```powershell
npm install
npm run demo
```

This starts a local Supabase instance (needs Docker running), a local mock LLM gateway, and the web app with seeded demo data. See README "Local development" for what's on and off in this mode, and the demo login.

To run against a real deployment instead, copy `.env.example` to `.env.local` at the repo root, fill in real credentials, then:

```powershell
npm run dev -w apps/web
npm test
npm run typecheck
npm run lint
```

## Before opening a pull request

```powershell
npm run typecheck
npm run lint
npm test
npm run build -w apps/web
```

All four must pass. If you touched anything under `apps/web`, also run the app (`npm run demo` or `npm run dev -w apps/web`) and actually use the feature you changed in a browser - typecheck and tests catch a lot, not everything (a component can typecheck and still be visibly broken; see `docs/DESIGN_NOTES.md` for a real example this project hit).

## Adding a check (a new verify/check gate)

Every check follows the same shape: `runGate(name, fn)` from `packages/cli/src/lib/gate.ts`, where `fn` either returns a short string (pass) or throws `Skip` (a dependency isn't configured) or `Fail` (a real problem).

- **Needs this repo's internals** (local build output, direct database access to create/tear down test rows, this repo's own shared infrastructure): add it to `packages/cli/src/commands/verify.ts`, following the existing gates for the pattern.
- **Only needs a URL plus vendor credentials, and should work against any install, not just one built from this exact repo**: add it to `packages/cli/src/lib/portableChecks.ts` instead, and wire it into `runPortableChecks()` so both `frontdesk verify` and `frontdesk check --target` can use it. Add a corresponding field to `packages/config/src/targetConfig.ts` if it needs new credentials or settings from the target config file.

Either way:

- Check the vendor's current docs before calling a new API - this project has hit real cases where docs disagreed with what the build spec assumed (see `docs/DESIGN_NOTES.md`).
- Write a vitest test for it (see `packages/cli/src/lib/portableChecks.test.ts` for the pattern: mock `fetch`, assert PASS/FAIL/SKIPPED).
- Never mark something as "tested" or "working" in a commit message or doc unless you actually ran it, ideally against a real deployed instance, not just against a mock.

## Adding a client

```powershell
npm run frontdesk -- init --client acme-plumbing
# edit clients/acme-plumbing/config.json
```

See README "Adding a client" for the full provision/verify loop, and `clients/_template/config.json` for every field a new client needs, with inline notes on what's required.

## House rules

- No secrets in commits, ever - not in code, not in docs, not in example output. `.env.local` and `workers/*/.dev.vars` are gitignored; keep it that way.
- No em dashes in docs or UI copy.
- Small, focused commits with a clear message explaining why, not just what.
- Plain English over marketing language - this project explains itself by being specific (exact gate names, exact status codes, exact numbers), not by asserting quality.
