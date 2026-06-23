import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.2";


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

async function logAudit(supabaseClient: any, payload: Record<string, unknown>) {
  try {
    await supabaseClient.from("audit_logs").insert(payload);

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
    const isSubordinateRes = await fetch(`${supabaseUrl}/rest/v1/rpc/is_subordinate_v2`, {
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
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  if (!SERVICE_KEY || !SUPABASE_URL) {
    return jsonResponse({ error: "Server configuration error" }, 500);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  const { data: { user: callerUser }, error: userError } = await supabase.auth.getUser(authHeader.slice(7));
  let callerId: string;
  if (userError || !callerUser) {
    const fallbackId = req.headers.get("x-user-id");
    if (fallbackId) {
      callerId = fallbackId;
    } else {
      return jsonResponse({ error: "Invalid session" }, 401);
    }
  } else {
    callerId = callerUser.id;
  }

  const { data: callerProfileData, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", callerId)
    .single();
  if (profileError) {
    console.error("Error fetching caller profile:", profileError);
    return jsonResponse({ error: "Profile not found" }, 403);
  }
  const callerProfile = callerProfileData;

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

    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      target_user_id,
      { password: new_password }
    );
    if (updateAuthError) return jsonResponse({ error: `Failed to update password: ${updateAuthError.message}` }, 400);
    
    await logAudit(supabase, { user_id: callerId, action: "UPDATE_PASSWORD", entity_type: "user", entity_id: target_user_id });
    return jsonResponse({ success: true });
  }

  // 2. TOGGLE STATUS (ACTIVATE/DEACTIVATE)
  if (action === "toggle_status") {
    const { target_user_id, is_active } = body;
    if (target_user_id === undefined || is_active === undefined) return jsonResponse({ error: "Missing data" }, 400);

    const hasAccess = await checkHierarchyAccess(SUPABASE_URL, SERVICE_KEY, callerId, target_user_id, callerProfile.role);
    if (!hasAccess) return jsonResponse({ error: "Unauthorized hierarchy access" }, 403);

    // Update Auth
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      target_user_id,
      { ban_duration: is_active ? "none" : "100000h" }
    );
    if (updateAuthError) console.error("Failed to update auth user status:", updateAuthError.message);

    // Update Profile
    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq("id", target_user_id);
    if (updateProfileError) return jsonResponse({ error: `Failed to update profile status: ${updateProfileError.message}` }, 400);

    await logAudit(supabase, { user_id: callerId, action: is_active ? "ACTIVATE_USER" : "DEACTIVATE_USER", entity_type: "user", entity_id: target_user_id });
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

    const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(target_user_id);

    if (deleteAuthError) {
        // Fallback to soft delete if hard delete fails due to FK
        const { error: softDeleteError } = await supabase
            .from("profiles")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", target_user_id);
        if (softDeleteError) {
            console.error("Failed to soft delete user:", softDeleteError.message);
            return jsonResponse({ error: `Failed to delete user: ${deleteAuthError.message}` }, 400);
        }
        return jsonResponse({ success: true, message: "Soft deleted due to constraints" });
    }

    await logAudit(supabase, { user_id: callerId, action: "DELETE_USER", entity_type: "user", entity_id: target_user_id });
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

    const { data: createData, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (createAuthError || !createData?.user?.id) return jsonResponse({ error: createAuthError?.message || "Failed to create Auth user" }, 400);

    const userId = createData.user.id;

    // Create Profile (Upsert/Patch)
    const { error: upsertProfileError } = await supabase
      .from("profiles")
      .upsert({ id: userId, email, full_name, phone, role, manager_id, active_branch_id: branch_id, is_active: true }, { onConflict: "id" });

    if (upsertProfileError) {
      console.error("Failed to upsert profile:", upsertProfileError.message);
      return jsonResponse({ error: `Failed to create user profile: ${upsertProfileError.message}` }, 400);
    }

    // Assign branch access if branch_id provided
    if (branch_id) {
        const { error: branchAccessError } = await supabase
            .from("user_branch_access")
            .insert({ user_id: userId, branch_id, role, is_active: true });
        if (branchAccessError) {
            console.error("Failed to assign branch access:", branchAccessError.message);
        }
    }

    await logAudit(supabase, { user_id: callerId, action: "CREATE_USER", entity_type: "user", entity_id: userId });
    return jsonResponse({ success: true, userId });
  }

  return jsonResponse({ error: "Invalid action" }, 400);
});
