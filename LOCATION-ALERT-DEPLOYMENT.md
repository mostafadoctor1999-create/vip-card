# Location alert relay deployment

The tracker is opt-in and follows the user's location only while the page remains open. After a confirmed departure beyond 100 m (including GPS accuracy), it sends one location alert to `/api/location-alert`. The Cloudflare Pages Function forwards it to Make; coordinates are not logged or returned to the browser.

## Deploy on Cloudflare Pages

1. Connect this repository to a Cloudflare Pages project and deploy the `add-location-alert-worker` branch (or merge its changes into the production branch).
2. In **Workers & Pages → your Pages project → Settings → Variables and Secrets**, add `MAKE_WEBHOOK_URL` as an encrypted secret containing the Make webhook URL that should receive location alerts. Do not commit the URL to this repository. Redeploy after adding the secret.
3. In the Make scenario, configure a webhook trigger that accepts JSON fields `event`, `latitude`, `longitude`, `accuracyMeters`, `distanceFromRestaurantMeters`, and `occurredAt`.
4. Open the deployed site over HTTPS. Test with explicit consent and verify receipt in the Make scenario. The function endpoint is same-origin at `/api/location-alert`.

This relay is a Cloudflare Pages Function (a Cloudflare Worker runtime) and requires Cloudflare Pages Functions support. It will not run on GitHub Pages or a generic static host. Do not enable the client tracking until the deployment and secret are configured. Geolocation is sensitive personal data: obtain valid consent and limit access/retention in the receiving Make scenario.
