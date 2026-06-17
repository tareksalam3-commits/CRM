import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

<<<<<<< HEAD
// FIX #EF1: Whitelist CORS — يقبل كل النطاقات المحتملة للتطوير والإنتاج
=======
// FIX #EF1: Whitelist CORS — no more wildcard "*"
>>>>>>> 4f861908343d864f2dd8df883bdc55b699004211
const ALLOWED_ORIGINS = [
  "https://crm-xi-lac.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
<<<<<<< HEAD
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
];

function corsHeaders(origin: string | null) {
  // في بيئة التطوير نسمح بأي origin، في الإنتاج نقيّد
  const isDev = Deno.env.get("ENVIRONMENT") !== "production";
  const o = (origin && (ALLOWED_ORIGINS.includes(origin) || isDev))
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data: object, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }

  // FIX #EF2: Require JWT Bearer
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "غير مصرح — يجب تسجيل الدخول أولاً" }, 401, origin);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // FIX #EF3: Validate SERVICE_KEY
  if (!SERVICE_KEY || !SUPABASE_URL) {
    return jsonResponse({ error: "خطأ في إعداد السيرفر — تواصل مع المطور" }, 500, origin);
  }

  // FIX #EF4: Parse body safely
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "طلب غير صالح — تحقق من البيانات المرسلة" }, 400, origin);
  }

  // ── Verify caller is a valid authenticated user ──────────────
  const token = authHeader.slice(7);
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });
  if (!verifyRes.ok) {
    return jsonResponse({ error: "جلسة المستخدم غير صالحة — أعد تسجيل الدخول" }, 401, origin);
  }
  const callerUser = await verifyRes.json();
  const callerId = callerUser?.id;

  // Check caller has a profile with manager role
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerId}&select=role,is_active`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
  );
  const profiles = await profileRes.json();
  const callerProfile = Array.isArray(profiles) ? profiles[0] : null;

  // ── Reset Password ──────────────────────────────────────────
  if (body.reset_password_for) {
    // Only managers can reset passwords
    if (!callerProfile || !["super_admin","dev_manager","general_supervisor","supervisor","team_leader"].includes(callerProfile.role)) {
      return jsonResponse({ error: "غير مصرح بتغيير كلمة المرور" }, 403, origin);
    }

    const newPass = body.new_password as string;
    if (!newPass || newPass.length < 6) {
      return jsonResponse({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" }, 400, origin);
    }

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${body.reset_password_for}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: newPass }),
    });
    const data = await res.json();
    if (!res.ok) {
      return jsonResponse({ error: data.message || "فشل تغيير كلمة المرور" }, 400, origin);
    }
    return jsonResponse({ success: true }, 200, origin);
  }

  // ── Delete User (with Soft Delete Fallback) ────────────────
  if (body.delete_user_id) {
    // Only super_admin can delete users
    if (!callerProfile || callerProfile.role !== "super_admin") {
      return jsonResponse({ error: "حذف المستخدمين متاح لـ super_admin فقط" }, 403, origin);
    }

    // Prevent self-deletion
    if (body.delete_user_id === callerId) {
      return jsonResponse({ error: "لا يمكنك حذف حسابك الخاص" }, 400, origin);
    }

    // Attempt hard delete first
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${body.delete_user_id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      }
    );

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const errorMessage = (d as Record<string,string>).message || "";

      // Soft delete if FK constraint prevents hard delete
      if (
        errorMessage.toLowerCase().includes("foreign key") ||
        res.status === 400 ||
        res.status === 409
      ) {
        const softRes = await fetch(
          `${SUPABASE_URL}/rest/v1/profiles?id=eq.${body.delete_user_id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${SERVICE_KEY}`,
              apikey: SERVICE_KEY,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
          }
        );

        if (softRes.ok) {
          return jsonResponse(
            { success: true, soft_deleted: true, message: "تم تعطيل الحساب لوجود بيانات مرتبطة" },
            200, origin
          );
        }
      }

      return jsonResponse({ error: errorMessage || "فشل الحذف" }, 400, origin);
    }
    return jsonResponse({ success: true }, 200, origin);
  }

  // ── Create User ──────────────────────────────────────────────
  // Validate caller has manager role
  if (!callerProfile || !["super_admin","dev_manager","general_supervisor","supervisor","team_leader"].includes(callerProfile.role)) {
    return jsonResponse({ error: "غير مصرح — فقط المديرون يمكنهم إنشاء مستخدمين" }, 403, origin);
  }

  const { email, password, full_name, phone, role, manager_id } = body as Record<string, string>;

  // FIX: Validate required fields
  if (!email || !password || !full_name) {
    return jsonResponse({ error: "البريد الإلكتروني وكلمة المرور والاسم مطلوبة" }, 400, origin);
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return jsonResponse({ error: "صيغة البريد الإلكتروني غير صالحة" }, 400, origin);
  }

  // FIX #EF5: Password length
  if (password.length < 6) {
    return jsonResponse({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف" }, 400, origin);
  }

  // FIX #EF6: Role whitelist
  const VALID_ROLES = ["super_admin","dev_manager","general_supervisor","supervisor","team_leader","agent"];
  if (role && !VALID_ROLES.includes(role)) {
    return jsonResponse({ error: "قيمة الدور غير مسموح بها" }, 400, origin);
  }

  // Create auth user
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const createData = await createRes.json();

  if (!createRes.ok || !createData.id) {
    let msg: string = createData.message || createData.msg || "فشل إنشاء الحساب";
    if (msg.includes("already registered") || msg.includes("already been registered")) {
      msg = "البريد الإلكتروني مستخدم بالفعل";
    } else if (msg.includes("invalid email")) {
      msg = "صيغة البريد غير صالحة";
    } else if (msg.includes("weak password")) {
      msg = "كلمة المرور ضعيفة جداً";
    }
    return jsonResponse({ error: msg }, 400, origin);
  }

  // Create profile row
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id: createData.id,
      email: email.toLowerCase().trim(),
      full_name: full_name.trim(),
      phone: phone || null,
      role: role || "agent",
      manager_id: manager_id || null,
      is_active: true,
    }),
  });

  if (!profRes.ok) {
    const errText = await profRes.text();
    // Rollback: delete the auth user
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createData.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    return jsonResponse(
      { error: "فشل إنشاء الملف الشخصي — تم التراجع: " + errText },
      400, origin
    );
  }

  return jsonResponse({ success: true, userId: createData.id }, 200, origin);
=======
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
>>>>>>> 4f861908343d864f2dd8df883bdc55b699004211
});
