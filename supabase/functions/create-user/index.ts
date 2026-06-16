import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// FIX #EF1: Whitelist CORS — no more wildcard "*"
const ALLOWED_ORIGINS = [
  "https://crm-xi-lac.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
];
function corsHeaders(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
}

serve(async (req) => {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // FIX #EF2: Require JWT Bearer
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer "))
    return new Response(JSON.stringify({ error: "غير مصرح — يجب تسجيل الدخول أولاً" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // FIX #EF3: Validate SERVICE_KEY
  if (!SERVICE_KEY)
    return new Response(JSON.stringify({ error: "خطأ في إعداد السيرفر" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  // FIX #EF4: Parse body safely
  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "طلب غير صالح" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }

  // ── Reset Password ──────────────────────────────────────
  if (body.reset_password_for) {
    const newPass = body.new_password as string;
    if (!newPass || newPass.length < 6)
      return new Response(JSON.stringify({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    const res  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${body.reset_password_for}`, { method: "PUT", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ password: newPass }) });
    const data = await res.json();
    if (!res.ok) return new Response(JSON.stringify({ error: data.message || "فشل تغيير كلمة المرور" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── Delete User (with Soft Delete Fallback) ──────────────
  if (body.delete_user_id) {
    // محاولة الحذف الفعلي أولاً
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${body.delete_user_id}`, { 
      method: "DELETE", 
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } 
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const errorMessage = (d as any).message || "";
      
      // إذا فشل الحذف بسبب وجود بيانات مرتبطة (Foreign Key Constraint)
      if (errorMessage.includes("foreign key") || res.status === 400) {
        // تنفيذ Soft Delete عبر تحديث is_active في جدول profiles
        const softDeleteRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${body.delete_user_id}`, {
          method: "PATCH",
          headers: { 
            Authorization: `Bearer ${SERVICE_KEY}`, 
            apikey: SERVICE_KEY, 
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
          },
          body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() })
        });

        if (softDeleteRes.ok) {
          return new Response(JSON.stringify({ success: true, soft_deleted: true, message: "تم تعطيل المستخدم لوجود بيانات مرتبطة" }), { headers: { ...cors, "Content-Type": "application/json" } });
        }
      }
      
      return new Response(JSON.stringify({ error: errorMessage || "فشل الحذف" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── Create User ─────────────────────────────────────────
  const { email, password, full_name, phone, role, manager_id } = body as Record<string, string>;
  if (!email || !password || !full_name)
    return new Response(JSON.stringify({ error: "email و password و full_name مطلوبة" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  // FIX #EF5: Password length
  if (password.length < 6)
    return new Response(JSON.stringify({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  // FIX #EF6: Role whitelist
  const VALID_ROLES = ["super_admin","dev_manager","general_supervisor","supervisor","team_leader","agent"];
  if (role && !VALID_ROLES.includes(role))
    return new Response(JSON.stringify({ error: "قيمة الدور غير مسموح بها" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  const createRes  = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, { method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, email_confirm: true }) });
  const createData = await createRes.json();
  if (!createRes.ok || !createData.id) {
    let msg: string = createData.message || createData.msg || "فشل إنشاء الحساب";
    if (msg.includes("already registered")) msg = "البريد الإلكتروني مستخدم بالفعل";
    else if (msg.includes("invalid email")) msg = "صيغة البريد غير صالحة";
    return new Response(JSON.stringify({ error: msg }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, { method: "POST", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ id: createData.id, email, full_name: full_name.trim(), phone: phone || null, role: role || "agent", manager_id: manager_id || null, is_active: true }) });
  if (!profRes.ok) {
    const errText = await profRes.text();
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createData.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } });
    return new Response(JSON.stringify({ error: "فشل الملف الشخصي — تم التراجع: " + errText }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ success: true, userId: createData.id }), { headers: { ...cors, "Content-Type": "application/json" } });
});
