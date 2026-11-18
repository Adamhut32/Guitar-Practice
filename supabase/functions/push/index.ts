// Sends Practice Log block-end alerts. Woken by the database every 30 seconds (shared secret), never by the app.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
let cfg: Record<string, string> | null = null;
async function config() {
  if (cfg) return cfg;
  const { data, error } = await db.rpc("push_config");
  if (error || !data) throw new Error("config unavailable");
  cfg = data as Record<string, string>;
  webpush.setVapidDetails("https://adamhut32.github.io/Guitar-Practice/", cfg.vapid_public, cfg.vapid_private);
  return cfg;
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let c;
  try { c = await config(); } catch { return json({ error: "config" }, 500); }
  if (req.headers.get("x-practice-secret") !== c.secret) return json({ error: "forbidden" }, 403);

  // claim due alerts so a second wake-up doesn't send them twice
  const now = new Date().toISOString();
  const { data: due } = await db.from("scheduled_pushes").update({ sent_at: now })
    .is("sent_at", null).lte("send_at", now).select("id, user_id, title, body, send_at");
  let sent = 0, removed = 0, failed = 0, stale = 0;
  for (const p of due || []) {
    // skip anything more than 10 minutes late (phone was off, cron paused)
    if (Date.now() - Date.parse(p.send_at) > 10 * 60 * 1000) { stale++; continue; }
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", p.user_id);
    const payload = JSON.stringify({ title: p.title, body: p.body || "", tag: "block" });
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 300, urgency: "high" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { await db.from("push_subscriptions").delete().eq("id", s.id); removed++; }
        else { failed++; console.error("push failed", code, String((e as Error).message || e).slice(0, 200)); }
      }
    }
  }
  return json({ due: (due || []).length, sent, removed, failed, stale });
});
