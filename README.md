# refit-bench

Runs the [Refit](https://github.com/pierceluu10/Refit) Stripe benchmark on GitHub-hosted runners, one job per shard. AI is off unless dispatched with `-f ai=true -f ai_budget=<USD>`. The full guide is `docs/GITHUB-BENCHMARKS.md` in the Refit repository.

```sh
gh workflow run benchmark.yml -R refit-dev/refit-bench \
  -f commit=<full 40-character Refit SHA> \
  -f list=2026-10-16-stripe-fresh-repos.json -f offset=0 -f count=50 -f size=1
gh run download <run-id> -R refit-dev/refit-bench -D <dir>
gh run download <run-id> -R refit-dev/refit-bench -n merged -D <dir>   # results.json, summary.md, missing.txt
```

Logs and artifacts here are public. Secrets: `REFIT_READ_TOKEN`, a fine-grained token with read-only Contents access to the Refit repository, and `OPENAI_API_KEY`, the owner's capped key, used only by AI runs. Never pass a key through an input.

Pass `-f count=all` for the rest of the list: `gh` drops an empty `-f count=`, and the default is 5. With `ai=true`, `-f ai_scope=behaviour-tests` spends the budget only on generated behaviour tests (`--behaviour-tests` instead of `--ai`); the default `patches` is the `--ai` run.

Each shard restores and saves two caches: prepared dependency bundles (a later Refit commit reuses the newest bundles of the same repositories; Refit checks every bundle's hashes before use) and the original code's check results (reused only by the same Refit commit). Each run saves at most `DEPENDENCY_CACHE_RUN_MIB` of bundles, to stay within the repository's 10 GB cache limit; the guide explains the rules.

The `merge` job checks that every repository the plan assigned has exactly one row. A shard that failed at setup shows up in `merged/missing.txt` and in the summary's first lines, and the job fails, so an incomplete run cannot pass for a complete one. Shards pull `node:22-alpine` and `stripe/stripe-mock:latest` (generated checks need it; Refit never pulls images itself), and `merged/images.txt` records the digests used. It runs Refit's `scripts/benchmark-merge.mjs` when the benchmarked commit has it; if the merge job stays queued 15 minutes after the last shard, force-cancel the run (`gh api -X POST repos/refit-dev/refit-bench/actions/runs/<id>/force-cancel`) and run that script on the downloaded shard artifacts.
