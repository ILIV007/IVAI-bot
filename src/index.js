import { cleanupRuntimeGuards, hasValidWebhookSecret, claimUpdate } from "./security.js";
import { handleUpdate } from "./router.js";
import { processBroadcastBatch, seedBroadcastDeliveries } from "./broadcast.js";
import { handleAdminRequest } from "./admin.js";
import { renderAdminPage } from "./admin-page.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=UTF-8" } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/admin") {
      return new Response(renderAdminPage(), { status: 200, headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-store" } });
    }
    if (request.method === "POST" && url.pathname.startsWith("/admin/")) {
      return handleAdminRequest(request, env);
    }
    if (request.method === "GET") {
      return new Response("IVAI Worker is ready.", { status: 200 });
    }

    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    if (!hasValidWebhookSecret(request, env)) return json({ ok: false, error: "unauthorized" }, 401);

    try {
      const update = await request.json();
      if (!await claimUpdate(update?.update_id, env)) return json({ ok: true, duplicate: true });
      await handleUpdate(update, env);
      return json({ ok: true });
    } catch (error) {
      console.error(JSON.stringify({ event: "webhook_failure", error: String(error?.message || "unknown") }));
      // Telegram retries non-2xx webhook calls; never expose internals in the response.
      return json({ ok: true });
    }
  },

  async scheduled(_controller, env, ctx) {
    const job = (async () => {
      await cleanupRuntimeGuards(env);
      const campaigns = await env.IVAI_DB
        ?.prepare("SELECT id FROM broadcast_campaigns WHERE status IN ('confirmed','queued','sending') ORDER BY updated_at ASC LIMIT 1")
        .all();
      for (const campaign of campaigns?.results || []) {
        await seedBroadcastDeliveries(campaign.id, env);
        await processBroadcastBatch(campaign.id, env);
      }
    })();
    ctx.waitUntil(job);
  }
};
