# <img src="public/books.svg" width="28" height="28" alt=""> Merge Queue Stats

![Queue stats, one row per pull request, and histograms along the chart's edges](docs/chart.png)

See how a GitHub merge queue is performing: every pull request's time in the queue, CI results, wait times and merge rate.

Open [mergeq.frustrated.dev](https://mergeq.frustrated.dev), log in with GitHub and pick a repo. The page talks straight to api.github.com from your browser.

The repo's owner needs the [usually-frustrated GitHub App](https://github.com/apps/usually-frustrated/installations/new) installed. The page shows that link when it is missing.

## Sharing a view

The share button copies a link with the repo, branch, workflow and date range in the query string. Each viewer logs in as themselves.

```
?repo=owner/name&branch=main&days=14
```

## Login

Logging in goes through auth.frustrated.dev, which keeps the session in a cookie and issues a read-only GitHub token for one account at a time. The page holds that token in memory and asks for a new one when it nears expiry or GitHub rejects it. Nothing about the token goes into localStorage.

## Develop

```
pnpm install
pnpm dev
pnpm typecheck
pnpm test
```

`pnpm dev` runs on localhost, where the login service refuses requests, so GitHub data only loads on the deployed page.

Pushes to `main` deploy to Cloudflare through `.github/workflows/deploy.yml`, which needs a `CLOUDFLARE_API_TOKEN` secret. `pnpm run deploy` does the same from your machine.

## License

MIT
