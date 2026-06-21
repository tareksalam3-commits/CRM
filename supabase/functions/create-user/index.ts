import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logAudit(supabaseUrl: string, serviceKey: string, payload: Record<string, unknown>) {
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

const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 0,
  dev_manager: 1,
  general_supervisor: 2,
  supervisor: 3,
  team_leader: 4,
  agent: 5,
};

async function checkHierarchyAccess(
  supabaseUrl: string,
  serviceKey: string,
  callerId: string,
  targetUserId: string,
  callerRole: string
): Promise<boolean> {
  if (callerRole === "super_admin") return true;

  if (callerRole === "dev_manager") {
    const targetRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${targetUserId}&select=role`,
      { headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey } }
    );
    const targets = await targetRes.json();
    const targetRole = Array.isArray(targets) ? targets[0]?.role : null;
    return targetRole !== "super_admin";
  }

  const isSubordinateRes = await fetch(`${supabaseUrl}/rest/v1/rpc/is_subordinate`, {
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
  });
  const result = await isSubordinateRes.json();
  return result === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized - please sign in first" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!SERVICE_KEY || !SUPABASE_URL) {
    console.error("Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return jsonResponse({ error: "Server configuration error - contact the developer" }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request - check the submitted data" }, 400);
  }

  const token = authHeader.slice(7);

  // For fallback-auth mode (no real session), fall back to the x-user-id header
  // set by the client. This lets a Super Admin manage users even when GoCore
  // schema issues block normal session signIn (legacy compatibility).
  const fallbackUserId = req.headers.get("x-user-id");
  let callerId: string | null = null;

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });

  if (verifyRes.ok) {
    const callerUser = await verifyRes.json();
    callerId = callerUser?.id ?? null;
  } else if (fallbackUserId) {
    callerId = fallbackUserId;
  } else {
    return jsonResponse({ error: "Invalid session - please sign in again" }, 401);
  }

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerId}&select=role,full_name,email,is_active`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
  );
  const profiles = await profileRes.json();
  const callerProfile = Array.isArray(profiles) ? profiles[0] : null;

  if (!callerProfile) {
    return jsonResponse({ error: "Your profile was not found - contact an administrator" }, 403);
  }
  if (callerProfile.is_active === false) {
    return jsonResponse({ error: "Your account is deactivated" }, 403);
  }

  // ---------- PASSWORD RESET ----------
  if (body.reset_password_for) {
    const targetId = body.reset_password_for as string;

    if (!["super_admin", "dev_manager", "general_supervisor", "supervisor", "team_leader"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Not authorized to reset this password" }, 403, );
    }

    const hasAccess = await checkHierarchyAccess(SUPABASE_URL, SERVICE_KEY, callerId!, targetId, callerProfile.role);
    if (!hasAccess) {
      return jsonResponse({ error: "Not authorized to reset this user account password" }, 403);
    }

    const newPass = body.new_password as string;
    if (!newPass || newPass.length < 6) {
      return jsonResponse({ error: "Password must be at least 6 characters" }, 400);
    }

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetId}`, {
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
      return jsonResponse({ error: data.message || "Failed to reset password in Supabase Auth" }, 400);
    }

    await logAudit(SUPABASE_URL, SERVICE_KEY, {
      user_id: callerId,
      action: "RESET_PASSWORD",
      entity_type: "user",
      entity_id: targetId,
      new_data: { action: "password_reset" },
      created_at: new Date().toISOString(),
    });

    return jsonResponse({ success: true });
  }

  // ---------- USER DELETION ----------
  if (body.delete_user_id) {
    const targetId = body.delete_user_id as string;

    if (!["super_admin", "dev_manager"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Deleting users is restricted to Super Admin and Dev Manager" }, 403);
    }
    if (targetId === callerId) {
      return jsonResponse({ error: "You cannot delete your own account" }, 400);
    }

    if (callerProfile.role === "dev_manager") {
      const targetRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${targetId}&select=role`,
        { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
      );
      const targets = await targetRes.json();
      const targetRole = Array.isArray(targets) ? targets[0]?.role : null;
      if (targetRole === "super_admin") {
        return jsonResponse({ error: "Dev Manager cannot delete a Super Admin account" }, 403);
      }
    }

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${targetId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      const errorMessage = (d as Record<string, string>).message || "";

      if (
        errorMessage.toLowerCase().includes("foreign key") ||
        res.status === 400 ||
        res.status === 409
      ) {
        const softRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${targetId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            apikey: SERVICE_KEY,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
        });

        if (softRes.ok) {
          await logAudit(SUPABASE_URL, SERVICE_KEY, {
            user_id: callerId,
            action: "SOFT_DELETE_USER",
            entity_type: "user",
            entity_id: targetId,
            created_at: new Date().toISOString(),
          });
          return jsonResponse({ success: true, soft_deleted: true });
        }
      }
      return jsonResponse({ error: errorMessage || "Delete failed" }, 400);
    }

    await logAudit(SUPABASE_URL, SERVICE_KEY, {
      user_id: callerId,
      action: "DELETE_USER",
      entity_type: "user",
      entity_id: targetId,
      created_at: new Date().toISOString(),
    });
    return jsonResponse({ success: true });
  }

  // ---------- USER CREATION ----------
  const { email, password, full_name, phone, role, manager_id } = body as Record<string, string>;

  if (!callerProfile || !["super_admin", "dev_manager", "general_supervisor", "supervisor", "team_leader"].includes(callerProfile.role)) {
    return jsonResponse({ error: "Unauthorized - only managers can create users" }, 403);
  }

  if (!email || !password || !full_name) {
    return jsonResponse({ error: "Email, password and full name are required" }, 400);
  }

  if (!Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, role)) {
    return jsonResponse({ error: "Invalid role" }, 400);
  }

  const callerLevel = ROLE_HIERARCHY[callerProfile.role] ?? 999;
  const newUserLevel = ROLE_HIERARCHY[role] ?? 999;

  if (callerProfile.role !== "super_admin") {
    if (newUserLevel <= callerLevel) {
      return jsonResponse({ error: "You cannot create a user with a rank equal to or higher than your own" }, 403);
    }
    if (role === "super_admin") {
      return jsonResponse({ error: "Only a Super Admin can create a Super Admin account" }, 403);
    }
  }

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    }),
  });
  const createData = await createRes.json();

  if (!createRes.ok || !createData.id) {
    return jsonResponse({ error: createData.message || "Failed to create account" }, 400);
  }

  // The DB has an AFTER INSERT trigger on auth.users (handle_new_user) that
  // already inserted the profile, so we UPSERT to apply the chosen role/phone/manager
  // (the trigger created a default row; this reconciles it with our intended data).
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${createData.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      email: email.toLowerCase().trim(),
      full_name: full_name.trim(),
      phone: phone || null,
      role: role || "agent",
      manager_id: manager_id || null,
      is_active: true,
    }),
  });

  // If UPSERT failed via PATCH (row doesn't exist because trigger didn't fire), INSERT.
  if (!profRes.ok) {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
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

    if (!insertRes.ok) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createData.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      });
      return jsonResponse({ error: "Failed to create user profile" }, 400);
    }
  }

  await logAudit(SUPABASE_URL, SERVICE_KEY, {
    user_id: callerId,
    action: "CREATE_USER",
    entity_type: "user",
    entity_id: createData.id,
    new_data: { email, full_name, role },
    created_at: new Date().toISOString(),
  });

  return jsonResponse({ success: true, userId: createData.id });
});
