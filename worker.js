// Secure proxy: keep the Make webhook only in the Cloudflare Worker secret.
// Required secrets/vars are documented in CLOUDFLARE-MAKE-SETUP.md.
const RESTAURANT = { latitude: 28.3095, longitude: 30.7123 };
const DEPARTURE_RADIUS_METERS = 100;
const MAX_BODY_BYTES = 4096;

function corsHeaders(origin, allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': origin === allowedOrigin ? allowedOrigin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  };
}

function jsonResponse(body, status, origin, allowedOrigin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin, allowedOrigin)
  });
}

function distanceInMeters(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadiusMeters = 6371000;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN;

    if (!allowedOrigin || origin !== allowedOrigin) {
      return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, allowedOrigin)
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/location-alert') {
      return jsonResponse({ error: 'Not found' }, 404, origin, allowedOrigin);
    }
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, origin, allowedOrigin);
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
      return jsonResponse({ error: 'Content-Type must be application/json' }, 415, origin, allowedOrigin);
    }

    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request too large' }, 413, origin, allowedOrigin);
    }

    let payload;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
        return jsonResponse({ error: 'Request too large' }, 413, origin, allowedOrigin);
      }
      payload = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400, origin, allowedOrigin);
    }

    if (
      !payload ||
      payload.event !== 'left_restaurant_radius' ||
      !Number.isFinite(payload.latitude) ||
      payload.latitude < -90 || payload.latitude > 90 ||
      !Number.isFinite(payload.longitude) ||
      payload.longitude < -180 || payload.longitude > 180 ||
      !Number.isFinite(payload.accuracyMeters) ||
      payload.accuracyMeters < 0 || payload.accuracyMeters > 10000
    ) {
      return jsonResponse({ error: 'Invalid alert payload' }, 400, origin, allowedOrigin);
    }

    const distance = distanceInMeters(
      payload.latitude,
      payload.longitude,
      RESTAURANT.latitude,
      RESTAURANT.longitude
    );

    // Recalculate on the server and only forward an unambiguous departure.
    if (distance - payload.accuracyMeters <= DEPARTURE_RADIUS_METERS) {
      return jsonResponse({ error: 'Outside-radius condition not confirmed' }, 422, origin, allowedOrigin);
    }

    if (!env.MAKE_WEBHOOK_URL) {
      console.error('MAKE_WEBHOOK_URL secret is not configured.');
      return jsonResponse({ error: 'Alert delivery is not configured' }, 503, origin, allowedOrigin);
    }

    let makeUrl;
    try {
      makeUrl = new URL(env.MAKE_WEBHOOK_URL);
      if (makeUrl.protocol !== 'https:' || !makeUrl.hostname.endsWith('.make.com')) {
        throw new Error('Invalid Make webhook host');
      }
    } catch {
      console.error('MAKE_WEBHOOK_URL must be a valid HTTPS Make webhook URL.');
      return jsonResponse({ error: 'Alert delivery configuration is invalid' }, 503, origin, allowedOrigin);
    }

    // Forward only the validated event and required coordinates. The recipient
    // must be configured inside Make, never supplied by the browser.
    const forwardedPayload = {
      event: 'left_restaurant_radius',
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracyMeters: payload.accuracyMeters,
      distanceFromRestaurantMeters: Math.round(distance),
      occurredAt: typeof payload.occurredAt === 'string' &&
        !Number.isNaN(Date.parse(payload.occurredAt))
        ? new Date(payload.occurredAt).toISOString()
        : new Date().toISOString()
    };

    try {
      const upstream = await fetch(makeUrl.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forwardedPayload),
        signal: AbortSignal.timeout(10000)
      });

      if (!upstream.ok) {
        console.error('Make webhook returned status:', upstream.status);
        return jsonResponse({ error: 'Alert delivery failed' }, 502, origin, allowedOrigin);
      }
    } catch (error) {
      console.error('Make webhook request failed:', error);
      return jsonResponse({ error: 'Alert delivery failed' }, 502, origin, allowedOrigin);
    }

    return jsonResponse({ ok: true }, 200, origin, allowedOrigin);
  }
};
