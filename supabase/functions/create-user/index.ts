import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // التحقق من هوية الطالب
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    // نتحقق من الجلسة مباشرة عبر Supabase REST API
    const meRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
      },
    });

    if (!meRes.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const meData = await meRes.json();
    const callerId = meData.id;

    // نتحقق من دور الطالب
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerId}&select=role`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      }
    );
    const profiles = await profileRes.json();
    const callerRole = profiles?.[0]?.role;
    const managerRoles = ["super_admin", "dev_manager", "general_supervisor", "supervisor", "team_leader"];

    if (!callerRole || !managerRoles.includes(callerRole)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // وضع إعادة تعيين كلمة المرور
    if (body.reset_password_for && body.new_password) {
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${body.reset_password_for}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: body.new_password }),
        }
      );
      const data = await res.json();
      if (!res.ok) return new Response(JSON.stringify({ error: data.message || "فشل تغيير كلمة المرور" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // وضع إنشاء مستخدم جديد
    const { email, password, full_name, phone, role, manager_id } = body;

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "email, password, full_name مطلوبة" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // إنشاء Auth user عبر Admin REST API
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
      }),
    });

    const createData = await createRes.json();

    if (!createRes.ok || !createData.id) {
      return new Response(JSON.stringify({ error: createData.message || "فشل إنشاء الحساب" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const newUserId = createData.id;

    // إنشاء Profile
    const profileInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: newUserId,
        email,
        full_name: full_name.trim(),
        phone: phone || null,
        role: role || "agent",
        manager_id: manager_id || null,
      }),
    });

    if (!profileInsertRes.ok) {
      const errText = await profileInsertRes.text();
      // Rollback: حذف الـ auth user
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${newUserId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
        },
      });
      return new Response(JSON.stringify({ error: "فشل إنشاء الملف الشخصي: " + errText }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, userId: newUserId }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
