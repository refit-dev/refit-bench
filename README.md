# refit-bench

Runs the [Refit](https://github.com/pierceluu10/Refit) Stripe benchmark on GitHub-hosted runners, one job per shard, without AI. The full guide is `docs/GITHUB-BENCHMARKS.md` in the Refit repository.

```sh
gh workflow run benchmark.yml -R refit-dev/refit-bench \
  -f commit=<full 40-character Refit SHA> \
  -f list=2026-10-16-stripe-fresh-repos.json -f offset=0 -f count=50 -f size=1
gh run download <run-id> -R refit-dev/refit-bench -D <dir>
jq -s add <dir>/shard-*/run/results.json > <dir>/results.json
```

Logs and artifacts here are public. The only secret is `REFIT_READ_TOKEN`, a fine-grained token with read-only Contents access to the Refit repository; never add an API key.
