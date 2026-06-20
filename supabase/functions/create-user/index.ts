import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ALLOWED_ORIGINS = [
  "https://crm-xi-lac.vercel.app",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
];

function corsHeaders(origin: string | null) {
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

async function logAudit(supabaseUrl: string, serviceKey: string, payload: any) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/audit_logs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Failed to log audit:", e);
  }
}

// ✅ دالة للتحقق من الدور الهرمي
async function checkHierarchyAccess(
  supabaseUrl: string,
  serviceKey: string,
  callerId: string,
  targetUserId: string,
  callerRole: string
): Promise<boolean> {
  // السوبر أدمن يمكنه الوصول لأي شخص
  if (callerRole === "super_admin") {
    return true;
  }

  // مدير التطوير يمكنه الوصول لأي شخص ما عدا السوبر أدمن
  if (callerRole === "dev_manager") {
    const targetRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${targetUserId}&select=role`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
    );
    const targets = await targetRes.json();
    const targetRole = Array.isArray(targets) ? targets[0]?.role : null;
    return targetRole !== "super_admin";
  }

  // بقية الأدوار يمكنهم الوصول لتابعيهم فقط (عبر manager_id)
  const isSubordinateRes = await fetch(
    `${supabaseUrl}/rest/v1/rpc/is_subordinate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        manager_uuid: callerId,
        subordinate_uuid: targetUserId,
      }),
    }
  );
  const result = await isSubordinateRes.json();
  return result === true;
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "غير مصرح — يجب تسجيل الدخول أولاً" }, 401, origin);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!SERVICE_KEY || !SUPABASE_URL) {
    console.error("Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonResponse({ error: "خطأ في إعداد السيرفر — تواصل مع المطور" }, 500, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "طلب غير صالح — تحقق من البيانات المرسلة" }, 400, origin);
  }

  const token = authHeader.slice(7);
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });

  if (!verifyRes.ok) {
    return jsonResponse({ error: "جلسة المستخدم غير صالحة — أعد تسجيل الدخول" }, 401, origin);
  }
  const callerUser = await verifyRes.json();
  const callerId = callerUser?.id;

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerId}&select=role,full_name`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
  );
  const profiles = await profileRes.json();
  const callerProfile = Array.isArray(profiles) ? profiles[0] : null;

  // ✅ وظيفة مؤقتة لإعادة تعيين جميع كلمات المرور (للمسؤول فقط)
  if (body.reset_all_passwords === true) {
    if (!callerProfile || callerProfile.role !== "super_admin") {
      return jsonResponse({ error: "هذه العملية متاحة لـ super_admin فقط" }, 403, origin);
    }

    const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    const { users } = await usersRes.json();
    
    let successCount = 0;
    for (const user of users) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: "123456" }),
      });
      if (res.ok) successCount++;
    }

    return jsonResponse({ success: true, message: `تمت إعادة تعيين ${successCount} كلمة مرور بنجاح` }, 200, origin);
  }

  // ✅ معالجة إعادة تعيين كلمة المرور
  if (body.reset_password_for) {
    console.log(`Password reset attempt for user ${body.reset_password_for} by ${callerId}`);

    if (!callerProfile || !["super_admin", "dev_manager", "general_supervisor", "supervisor", "team_leader"].includes(callerProfile.role)) {
      return jsonResponse({ error: "غير مصرح بتغيير كلمة المرور" }, 403, origin);
    }

    // ✅ التحقق من الهيكل الهرمي
    const hasAccess = await checkHierarchyAccess(
      SUPABASE_URL,
      SERVICE_KEY,
      callerId,
      body.reset_password_for as string,
      callerProfile.role
    );

    if (!hasAccess) {
      return jsonResponse({ error: "غير مصرح بتغيير كلمة المرور لهذا المستخدم" }, 403, origin);
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
      console.error(`Supabase Auth Admin Error: ${JSON.stringify(data)}`);
      return jsonResponse({ error: data.message || "فشل تغيير كلمة المرور في Supabase Auth" }, 400, origin);
    }

    await logAudit(SUPABASE_URL, SERVICE_KEY, {
      user_id: callerId,
      action: "RESET_PASSWORD",
      entity_type: "user",
      entity_id: body.reset_password_for,
      changes: { action: "password_reset" },
      created_at: new Date().toISOString()
    });

    return jsonResponse({ success: true }, 200, origin);
  }

  // ✅ معالجة حذف المستخدم
  if (body.delete_user_id) {
    if (!callerProfile || callerProfile.role !== "super_admin") {
      return jsonResponse({ error: "حذف المستخدمين متاح لـ super_admin فقط" }, 403, origin);
    }

    if (body.delete_user_id === callerId) {
      return jsonResponse({ error: "لا يمكنك حذف حسابك الخاص" }, 400, origin);
    }

    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${body.delete_user_id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      }
    );

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const errorMessage = (d as Record<string, string>).message || "";

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
          await logAudit(SUPABASE_URL, SERVICE_KEY, {
            user_id: callerId,
            action: "SOFT_DELETE_USER",
            entity_type: "user",
            entity_id: body.delete_user_id,
            created_at: new Date().toISOString()
          });
          return jsonResponse({ success: true, soft_deleted: true }, 200, origin);
        }
      }
      return jsonResponse({ error: errorMessage || "فشل الحذف" }, 400, origin);
    }

    await logAudit(SUPABASE_URL, SERVICE_KEY, {
      user_id: callerId,
      action: "DELETE_USER",
      entity_type: "user",
      entity_id: body.delete_user_id,
      created_at: new Date().toISOString()
    });
    return jsonResponse({ success: true }, 200, origin);
  }

  // ✅ معالجة إنشاء مستخدم جديد
  if (!callerProfile || !["super_admin", "dev_manager", "general_supervisor", "supervisor", "team_leader"].includes(callerProfile.role)) {
    return jsonResponse({ error: "غير مصرح — فقط المديرون يمكنهم إنشاء مستخدمين" }, 403, origin);
  }

  const { email, password, full_name, phone, role, manager_id } = body as Record<string, string>;

  if (!email || !password || !full_name) {
    return jsonResponse({ error: "البريد الإلكتروني وكلمة المرور والاسم مطلوبة" }, 400, origin);
  }

  // ✅ التحقق من أن المستخدم الذي سيتم إنشاؤه ليس أعلى رتبة من المنشئ
  const roleHierarchy: Record<string, number> = {
    super_admin: 0,
    dev_manager: 1,
    general_supervisor: 2,
    supervisor: 3,
    team_leader: 4,
    branch_manager: 4,
    agent: 5,
  };

  const callerLevel = roleHierarchy[callerProfile.role] || 999;
  const newUserLevel = roleHierarchy[role] || 999;

  if (newUserLevel < callerLevel && callerProfile.role !== "super_admin") {
    return jsonResponse({ error: "لا يمكنك إنشاء مستخدم برتبة أعلى من رتبتك" }, 403, origin);
  }

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
    return jsonResponse({ error: createData.message || "فشل إنشاء الحساب" }, 400, origin);
  }

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
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createData.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });
    return jsonResponse({ error: "فشل إنشاء الملف الشخصي" }, 400, origin);
  }

  await logAudit(SUPABASE_URL, SERVICE_KEY, {
    user_id: callerId,
    action: "CREATE_USER",
    entity_type: "user",
    entity_id: createData.id,
    new_data: { email, full_name, role },
    created_at: new Date().toISOString()
  });

  return jsonResponse({ success: true, userId: createData.id }, 200, origin);
});
