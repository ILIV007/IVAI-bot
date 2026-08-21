import { cleanupRuntimeGuards, hasValidWebhookSecret, claimUpdate, releaseUpdateClaim } from "./security.js";
import { handleUpdate } from "./router.js";
import { processBroadcastBatch, seedBroadcastDeliveries } from "./broadcast.js";
import { handleAdminRequest } from "./admin.js";
import { renderAdminPage } from "./admin-page.js";
import { handleAppRequest } from "./app-api.js";
import { renderAppPage } from "./app-page.js";
import { processSecretaryReminderBatch } from "./secretary.js";
import { processReengagementBatch } from "./reengagement.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=UTF-8" } });
}

function terminalNonce() {
  return crypto.randomUUID().replaceAll("-", "");
}

function terminalHeaders(nonce) {
  return {
    "content-type": "text/html; charset=UTF-8",
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
    "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}' https://telegram.org; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org`
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/app") {
      if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
      const nonce = terminalNonce();
      return new Response(renderAppPage(nonce), { status: 200, headers: terminalHeaders(nonce) });
    }
    if (url.pathname.startsWith("/app/")) {
      if (request.method === "POST") return handleAppRequest(request, env);
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }
    if (url.pathname === "/admin") {
      if (request.method === "GET") {
        const nonce = terminalNonce();
        return new Response(renderAdminPage(nonce), { status: 200, headers: terminalHeaders(nonce) });
      }
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }
    if (url.pathname.startsWith("/admin/")) {
      if (request.method === "POST") return handleAdminRequest(request, env);
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }
    if (request.method === "GET") {
      return new Response("IVAI Worker is ready.", { status: 200 });
    }

    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    if (!hasValidWebhookSecret(request, env)) return json({ ok: false, error: "unauthorized" }, 401);

    let update;
    try {
      update = await request.json();
      if (!await claimUpdate(update?.update_id, env)) return json({ ok: true, duplicate: true });
      await handleUpdate(update, env);
      return json({ ok: true });
    } catch (error) {
      await releaseUpdateClaim(update?.update_id, env).catch(() => {});
      console.error(JSON.stringify({ event: "webhook_failure", updateId: String(update?.update_id || "unknown"), error: String(error?.message || "unknown") }));
      // A non-2xx response asks Telegram to retry. The claim is released above so
      // retry does not get suppressed by the idempotency guard.
      return json({ ok: false, error: "temporary_failure" }, 500);
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
      await processSecretaryReminderBatch(env, { limit: 4 });
      await processReengagementBatch(env, { limit: 5 });
    })();
    ctx.waitUntil(job);
  }
};
