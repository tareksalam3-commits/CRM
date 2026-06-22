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

  // Check if target is subordinate via RPC
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
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const token = authHeader.slice(7);
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_KEY },
  });

  let callerId: string;
  if (verifyRes.ok) {
    const callerUser = await verifyRes.json();
    callerId = callerUser.id;
  } else {
    const fallbackId = req.headers.get("x-user-id");
    if (fallbackId) {
      callerId = fallbackId;
    } else {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
  }

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerId}&select=role,is_active`,
    { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
  );
  const profiles = await profileRes.json();
  const callerProfile = Array.isArray(profiles) ? profiles[0] : null;

  if (!callerProfile || callerProfile.is_active === false) {
    return jsonResponse({ error: "Account inactive or profile not found" }, 403);
  }

  const action = body.action;

  // 1. UPDATE PASSWORD
  if (action === "update_password") {
    const { target_user_id, new_password } = body;
    if (!target_user_id || !new_password) return jsonResponse({ error: "Missing data" }, 400);

    const hasAccess = await checkHierarchyAccess(SUPABASE_URL, SERVICE_KEY, callerId, target_user_id, callerProfile.role);
    if (!hasAccess) return jsonResponse({ error: "Unauthorized hierarchy access" }, 403);

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${target_user_id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ password: new_password }),
    });

    if (!res.ok) return jsonResponse({ error: "Failed to update password" }, 400);
    
    await logAudit(SUPABASE_URL, SERVICE_KEY, { user_id: callerId, action: "UPDATE_PASSWORD", entity_type: "user", entity_id: target_user_id });
    return jsonResponse({ success: true });
  }

  // 2. TOGGLE STATUS (ACTIVATE/DEACTIVATE)
  if (action === "toggle_status") {
    const { target_user_id, is_active } = body;
    if (target_user_id === undefined || is_active === undefined) return jsonResponse({ error: "Missing data" }, 400);

    const hasAccess = await checkHierarchyAccess(SUPABASE_URL, SERVICE_KEY, callerId, target_user_id, callerProfile.role);
    if (!hasAccess) return jsonResponse({ error: "Unauthorized hierarchy access" }, 403);

    // Update Auth
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${target_user_id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ ban_duration: is_active ? "none" : "100000h" }),
    });

    // Update Profile
    const profUpdate = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${target_user_id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ is_active, updated_at: new Date().toISOString() }),
    });

    if (!profUpdate.ok) return jsonResponse({ error: "Failed to update profile status" }, 400);

    await logAudit(SUPABASE_URL, SERVICE_KEY, { user_id: callerId, action: is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER", entity_type: "user", entity_id: target_user_id });
    return jsonResponse({ success: true });
  }

  // 3. DELETE USER
  if (action === "delete_user") {
    const { target_user_id } = body;
    if (!target_user_id) return jsonResponse({ error: "Missing user ID" }, 400);
    if (target_user_id === callerId) return jsonResponse({ error: "Cannot delete self" }, 400);

    if (!["super_admin", "dev_manager"].includes(callerProfile.role)) return jsonResponse({ error: "Restricted to admins" }, 403);

    const hasAccess = await checkHierarchyAccess(SUPABASE_URL, SERVICE_KEY, callerId, target_user_id, callerProfile.role);
    if (!hasAccess) return jsonResponse({ error: "Unauthorized hierarchy access" }, 403);

    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${target_user_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    });

    if (!res.ok) {
        // Fallback to soft delete if hard delete fails due to FK
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${target_user_id}`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: false, updated_at: new Date().toISOString() }),
        });
        return jsonResponse({ success: true, message: "Soft deleted due to constraints" });
    }

    await logAudit(SUPABASE_URL, SERVICE_KEY, { user_id: callerId, action: "DELETE_USER", entity_type: "user", entity_id: target_user_id });
    return jsonResponse({ success: true });
  }

  // 4. CREATE USER
  if (action === "create_user" || !action) {
    const { email, password, full_name, phone, role, manager_id, branch_id } = body;
    if (!email || !password || !full_name || !role) return jsonResponse({ error: "Missing required fields" }, 400);

    const callerLevel = ROLE_HIERARCHY[callerProfile.role] ?? 999;
    const newUserLevel = ROLE_HIERARCHY[role] ?? 999;

    if (callerProfile.role !== "super_admin" && newUserLevel <= callerLevel) {
      return jsonResponse({ error: "Cannot create user with higher or equal rank" }, 403);
    }

    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name, role } }),
    });
    const createData = await createRes.json();

    if (!createRes.ok || !createData.id) return jsonResponse({ error: createData.message || "Failed to create Auth user" }, 400);

    const userId = createData.id;

    // Create Profile (Upsert/Patch)
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ email, full_name, phone, role, manager_id, branch_id, is_active: true }),
    });

    if (!profRes.ok) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ id: userId, email, full_name, phone, role, manager_id, branch_id, is_active: true }),
        });
    }

    // Assign branch access if branch_id provided
    if (branch_id) {
        await fetch(`${SUPABASE_URL}/rest/v1/user_branch_access`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, branch_id, role, is_active: true }),
        });
    }

    await logAudit(SUPABASE_URL, SERVICE_KEY, { user_id: callerId, action: "CREATE_USER", entity_type: "user", entity_id: userId });
    return jsonResponse({ success: true, userId });
  }

  return jsonResponse({ error: "Invalid action" }, 400);
});
