import webpush from "web-push";

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
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

    const payload = JSON.stringify({
      title: "Word Ladder",
      body: "Today's puzzle is ready — come climb the ladder!",
    });

    const list = await env.SUBSCRIPTIONS.list();
    for (const { name } of list.keys) {
      const raw = await env.SUBSCRIPTIONS.get(name);
      if (!raw) continue;
      const subscription = JSON.parse(raw);
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await env.SUBSCRIPTIONS.delete(name);
        }
      }
    }
  },
};
