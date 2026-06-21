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

// Helper: hierarchical role-based access check
async function checkHierarchyAccess(
  supabaseUrl: string,
  serviceKey: string,
  callerId: string,
  targetUserId: string,
  callerRole: string
): Promise<boolean> {
  // Super admin can access anyone
  if (callerRole === "super_admin") {
    return true;
  }

  // Dev manager can access anyone except super_admin
  if (callerRole === "dev_manager") {
    const targetRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${targetUserId}&select=role`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
    );
    const targets = await targetRes.json();
    const targetRole = Array.isArray(targets) ? targets[0]?.role : null;
    return targetRole !== "super_admin";
  }

  // Other roles can only access their subordinates (via manager_id)
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
    return jsonResponse({ error: "Unauthorized - please sign in first" }, 401, origin);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!SERVICE_KEY || !SUPABASE_URL) {
    console.error("Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonResponse({ error: "Server configuration error - contact the developer" }, 500, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request - check the submitted data" }, 400, origin);
  }

  const token = authHeader.slice(7);
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });

  if (!verifyRes.ok) {
    return jsonResponse({ error: "Invalid session - please sign in again" }, 401, origin);
  }
  const callerUser = await verifyRes.json();
  const callerId = callerUser?.id;

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerId}&select=role,full_name`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
  );
  const profiles = await profileRes.json();
  const callerProfile = Array.isArray(profiles) ? profiles[0] : null;

  // Handle password reset (single specific user only)
  if (body.reset_password_for) {
    console.log(`Password reset attempt for user ${body.reset_password_for} by ${callerId}`);

    if (!callerProfile || !["super_admin", "dev_manager", "general_supervisor", "supervisor", "team_leader"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Not authorized to reset this password" }, 403, origin);
    }

    // Check hierarchical access
    const hasAccess = await checkHierarchyAccess(
      SUPABASE_URL,
      SERVICE_KEY,
      callerId,
      body.reset_password_for as string,
      callerProfile.role
    );

    if (!hasAccess) {
      return jsonResponse({ error: "Not authorized to reset this user account password" }, 403, origin);
    }

    const newPass = body.new_password as string;
    if (!newPass || newPass.length < 6) {
      return jsonResponse({ error: "Password must be at least 6 characters" }, 400, origin);
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
      return jsonResponse({ error: data.message || "Failed to reset password in Supabase Auth" }, 400, origin);
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

  // Handle user deletion - Super Admin and Dev Manager (Dev Manager cannot delete Super Admin)
  if (body.delete_user_id) {
    if (!callerProfile || !["super_admin", "dev_manager"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Deleting users is restricted to Super Admin and Dev Manager" }, 403, origin);
    }

    if (body.delete_user_id === callerId) {
      return jsonResponse({ error: "You cannot delete your own account" }, 400, origin);
    }

    // Dev manager cannot delete a Super Admin
    if (callerProfile.role === "dev_manager") {
      const targetRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${body.delete_user_id}&select=role`,
        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
      );
      const targets = await targetRes.json();
      const targetRole = Array.isArray(targets) ? targets[0]?.role : null;
      if (targetRole === "super_admin") {
        return jsonResponse({ error: "Dev Manager cannot delete a Super Admin account" }, 403, origin);
      }
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
      return jsonResponse({ error: errorMessage || "Delete failed" }, 400, origin);
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

  // Handle new user creation
  if (!callerProfile || !["super_admin", "dev_manager", "general_supervisor", "supervisor", "team_leader"].includes(callerProfile.role)) {
    return jsonResponse({ error: "Unauthorized - only managers can create users" }, 403, origin);
  }

  const { email, password, full_name, phone, role, manager_id } = body as Record<string, string>;

  if (!email || !password || !full_name) {
    return jsonResponse({ error: "Email, password and full name are required" }, 400, origin);
  }

  // Ensure the new user's role is strictly lower in rank than the creator
  // (unless the creator is super_admin, who can create any role)
  const roleHierarchy: Record<string, number> = {
    super_admin: 0,
    dev_manager: 1,
    general_supervisor: 2,
    supervisor: 3,
    team_leader: 4,
    agent: 5,
  };

  if (!Object.prototype.hasOwnProperty.call(roleHierarchy, role)) {
    return jsonResponse({ error: "Invalid role" }, 400, origin);
  }

  const callerLevel = roleHierarchy[callerProfile.role] ?? 999;
  const newUserLevel = roleHierarchy[role] ?? 999;

  if (callerProfile.role !== "super_admin") {
    if (newUserLevel <= callerLevel) {
      return jsonResponse({ error: "You cannot create a user with a rank equal to or higher than your own" }, 403, origin);
    }
    // Dev manager can never create a Super Admin account
    if (role === "super_admin") {
      return jsonResponse({ error: "Only a Super Admin can create a Super Admin account" }, 403, origin);
    }
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
    return jsonResponse({ error: createData.message || "Failed to create account" }, 400, origin);
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
    return jsonResponse({ error: "Failed to create user profile" }, 400, origin);
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
