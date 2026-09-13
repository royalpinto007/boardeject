# Website deployment

https://boardeject.dev serves the static `dist/` build on Cloudflare Pages.
The website exposes the early release and its explicit fidelity limitations.

```sh
npm ci
npm run build
npx wrangler pages deploy dist --project-name boardeject --branch main
```

The Pages project already exists. Initial project creation used `--force` to
avoid Wrangler's Workers delegation; subsequent deployments do not need it.
Supply `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` through the environment. Never commit credentials or
put them in frontend environment variables. No board-processing server is deployed.

Deployment is explicit, not tied to tags or every GitHub push. To roll back,
redeploy a known-good commit or use the Cloudflare Pages rollback interface.
Keep the support limitations visible. Verify `/privacy`, `/terms`, the demo,
and the example-to-edit flow after deployment.
