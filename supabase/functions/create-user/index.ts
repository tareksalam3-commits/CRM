import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── تحقق من هوية الطالب ──────────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

  if (!token) {
    return new Response(JSON.stringify({ error: "لا يوجد token" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // نتحقق من صحة الـ token عبر Supabase Admin API
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { "Authorization": `Bearer ${token}`, "apikey": SERVICE_KEY },
  });

  if (!userRes.ok) {
    const txt = await userRes.text();
    return new Response(JSON.stringify({ error: "Unauthorized: " + txt }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const caller = await userRes.json();

  // نتحقق من دور الطالب
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${caller.id}&select=role`,
    { headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY } }
  );
  const profiles = await profileRes.json();
  const callerRole = profiles?.[0]?.role ?? "";
  const managerRoles = ["super_admin", "dev_manager", "general_supervisor", "supervisor", "team_leader"];

  if (!managerRoles.includes(callerRole)) {
    return new Response(JSON.stringify({ error: "غير مصرح" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const body = await req.json();

  // ── إعادة تعيين كلمة المرور ─────────────────────────────
  if (body.reset_password_for) {
    if (!body.new_password || body.new_password.length < 6) {
      return new Response(JSON.stringify({ error: "كلمة المرور 6 أحرف على الأقل" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${body.reset_password_for}`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ password: body.new_password }),
    });
    if (!res.ok) {
      const e = await res.json();
      return new Response(JSON.stringify({ error: e.message || "فشل تغيير كلمة المرور" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── حذف مستخدم ──────────────────────────────────────────
  if (body.delete_user_id) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${body.delete_user_id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
    });
    if (!res.ok) {
      const e = await res.json();
      return new Response(JSON.stringify({ error: e.message || "فشل الحذف" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ── إنشاء مستخدم جديد ───────────────────────────────────
  const { email, password, full_name, phone, role, manager_id } = body;

  if (!email || !password || !full_name) {
    return new Response(JSON.stringify({ error: "email و password و full_name مطلوبة" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (password.length < 6) {
    return new Response(JSON.stringify({ error: "كلمة المرور 6 أحرف على الأقل" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // إنشاء Auth user
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  const createData = await createRes.json();
  if (!createRes.ok || !createData.id) {
    return new Response(JSON.stringify({ error: createData.msg || createData.message || "فشل إنشاء الحساب" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const newUserId = createData.id;

  // إنشاء Profile
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY,
      "Content-Type": "application/json", "Prefer": "return=minimal",
    },
    body: JSON.stringify({
      id: newUserId, email, full_name: full_name.trim(),
      phone: phone || null, role: role || "agent", manager_id: manager_id || null,
    }),
  });

  if (!profRes.ok) {
    const errText = await profRes.text();
    // Rollback
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${newUserId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
    });
    return new Response(JSON.stringify({ error: "فشل إنشاء الملف الشخصي: " + errText }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true, userId: newUserId }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
