import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const body = await req.json();

  // ── إعادة تعيين كلمة المرور ──────────────────────────────
  if (body.reset_password_for) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${body.reset_password_for}`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ password: body.new_password }),
    });
    const data = await res.json();
    if (!res.ok) return new Response(JSON.stringify({ error: data.message || "فشل" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── حذف مستخدم ───────────────────────────────────────────
  if (body.delete_user_id) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${body.delete_user_id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
    });
    if (!res.ok) return new Response(JSON.stringify({ error: "فشل الحذف" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── إنشاء مستخدم جديد ────────────────────────────────────
  const { email, password, full_name, phone, role, manager_id } = body;

  if (!email || !password || !full_name) {
    return new Response(JSON.stringify({ error: "email و password و full_name مطلوبة" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // إنشاء Auth user
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  const createData = await createRes.json();
  if (!createRes.ok || !createData.id) {
    return new Response(JSON.stringify({ error: createData.message || createData.msg || "فشل إنشاء الحساب" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // إنشاء Profile
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify({ id: createData.id, email, full_name: full_name.trim(), phone: phone || null, role: role || "agent", manager_id: manager_id || null }),
  });

  if (!profRes.ok) {
    const errText = await profRes.text();
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createData.id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
    });
    return new Response(JSON.stringify({ error: "فشل الملف الشخصي: " + errText }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ success: true, userId: createData.id }), { headers: { ...cors, "Content-Type": "application/json" } });
});
