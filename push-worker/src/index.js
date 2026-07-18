import { sendWebPush } from "./webpush.js";

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function keyFor(subscription) {
  return encodeURIComponent(subscription.endpoint);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = corsHeaders(env);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (url.pathname === "/subscribe" && request.method === "POST") {
      const subscription = await request.json();
      if (!subscription || !subscription.endpoint) {
        return new Response("Invalid subscription", { status: 400, headers });
      }
      await env.SUBSCRIPTIONS.put(keyFor(subscription), JSON.stringify(subscription));
      return new Response("OK", { headers });
    }

    if (url.pathname === "/unsubscribe" && request.method === "POST") {
      const { endpoint } = await request.json();
      if (!endpoint) {
        return new Response("Invalid request", { status: 400, headers });
      }
      await env.SUBSCRIPTIONS.delete(encodeURIComponent(endpoint));
      return new Response("OK", { headers });
    }

    return new Response("Not found", { status: 404, headers });
  },

  async scheduled(event, env, ctx) {
    const vapidPrivateJwk = JSON.parse(env.VAPID_PRIVATE_KEY);

    const list = await env.SUBSCRIPTIONS.list();
    console.log(`scheduled: ${list.keys.length} subscription(s) found`);
    for (const { name } of list.keys) {
      const raw = await env.SUBSCRIPTIONS.get(name);
      if (!raw) continue;
      const subscription = JSON.parse(raw);
      try {
        const res = await sendWebPush({
          subscription,
          payload: {
            title: "Word Ladder",
            body: "Today's puzzle is ready — come climb the ladder!",
          },
          vapidPrivateJwk,
          vapidPublicKey: env.VAPID_PUBLIC_KEY,
          subject: env.VAPID_SUBJECT,
        });
        console.log(`sent to ${name}: status ${res.status}`);
        if (res.status === 404 || res.status === 410) {
          await env.SUBSCRIPTIONS.delete(name);
        }
      } catch (err) {
        console.error(`failed to send to ${name}: ${err.message || err}`);
      }
    }
  },
};
