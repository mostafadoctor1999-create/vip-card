// Cloudflare Pages Function: POST /api/location-alert
// Configure MAKE_WEBHOOK_URL as a Cloudflare Pages secret (never commit the value).
export async function onRequestPost({ request, env }) {
  const json = (body, status) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

  // Browser requests must originate from this site's own origin.
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ ok: false, error: 'Forbidden' }, 403);
  }
  if (!env.MAKE_WEBHOOK_URL) {
    return json({ ok: false, error: 'Alert delivery is not configured' }, 503);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return json({ ok: false, error: 'Expected application/json' }, 415);
  }

  let input;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return json({ ok: false, error: 'Payload too large' }, 413);
    input = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const { latitude, longitude, accuracyMeters, distanceFromRestaurantMeters, occurredAt } = input || {};
  if (
    input.event !== 'left_restaurant_radius' ||
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    !Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100000 ||
    !Number.isFinite(distanceFromRestaurantMeters) || distanceFromRestaurantMeters < 0 || distanceFromRestaurantMeters > 50000000 ||
    typeof occurredAt !== 'string' || !Number.isFinite(Date.parse(occurredAt))
  ) {
    return json({ ok: false, error: 'Invalid alert payload' }, 400);
  }

  // Do not log or return the location. The webhook URL stays in the Pages secret.
  try {
    const upstream = await fetch(env.MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'left_restaurant_radius',
        latitude,
        longitude,
        accuracyMeters,
        distanceFromRestaurantMeters,
        occurredAt
      })
    });
    if (!upstream.ok) return json({ ok: false, error: 'Alert delivery failed' }, 502);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return json({ ok: false, error: 'Alert delivery failed' }, 502);
  }
}

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Allow': 'POST, OPTIONS' } });
  return new Response('Method not allowed', { status: 405, headers: { 'Allow': 'POST' } });
}
