# refit-bench

Runs the [Refit](https://github.com/pierceluu10/Refit) Stripe benchmark on GitHub-hosted runners, one job per shard. AI is off unless dispatched with `-f ai=true -f ai_budget=<USD>`. The full guide is `docs/GITHUB-BENCHMARKS.md` in the Refit repository.

```sh
gh workflow run benchmark.yml -R refit-dev/refit-bench \
  -f commit=<full 40-character Refit SHA> \
  -f list=2026-10-16-stripe-fresh-repos.json -f offset=0 -f count=50 -f size=1
gh run download <run-id> -R refit-dev/refit-bench -D <dir>
gh run download <run-id> -R refit-dev/refit-bench -n merged -D <dir>   # results.json, summary.md, missing.txt
```

`shopify.yml` runs the Shopify benchmark the same way, without AI or secrets beyond `REFIT_READ_TOKEN`. Its `snapshots` job reads the Admin API schemas once from Shopify's public documentation proxy and every shard validates those saved bytes. Shopify changes published schemas in place, so `contracts=current` (the default) uses today's and flags the drift in the summary; `contracts=pinned` stops unless Shopify still serves the frozen list's hashes.

```sh
gh workflow run shopify.yml -R refit-dev/refit-bench \
  -f commit=<full 40-character Refit SHA> \
  -f list=2026-10-16-shopify-fresh-repos.json -f offset=0 -f count=50 -f size=5
```

`rules.yml` runs Refit's `rules check` on the committed Stripe rule tables, then `rules generate` for the pinned API versions with `OPENAI_API_KEY`, and uploads `results.json` and `audit.json` (see `docs/MINED-RULES.md` in Refit). It never writes to Refit.

```sh
gh workflow run rules.yml -R refit-dev/refit-bench -f commit=<full 40-character Refit SHA> -f ai_budget=1
```

Logs and artifacts here are public. Secrets: `REFIT_READ_TOKEN`, a fine-grained token with read-only Contents access to the Refit repository, and `OPENAI_API_KEY`, the owner's capped key, used only by AI runs. `STRIPE_TEST_KEY` holds Refit's own Stripe test-mode key; `benchmark.yml` passes it only when `flags` contain `--stripe-test-mode` (with `ai: true` and `--behaviour-tests`), in the same env file as the OpenAI key, and Refit refuses any key that is not `sk_test_` or `rk_test_`. Never pass a key through an input.

The `merge` job checks that every repository the plan assigned has exactly one row. A shard that failed at setup shows up in `merged/missing.txt` and in the summary's first lines, and the job fails, so an incomplete run cannot pass for a complete one. Shards pull `node:22-alpine` and `stripe/stripe-mock:latest` (generated checks need it; Refit never pulls images itself), and `merged/images.txt` records the digests used.
