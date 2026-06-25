import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Debug: log env vars
    const debug = {
      url: supabaseUrl,
      keyPrefix: serviceRoleKey?.substring(0, 20) + "...",
      keyLength: serviceRoleKey?.length,
    };

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Try listing users first
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      return jsonResponse({ debug, listError: JSON.stringify(listError), message: listError.message });
    }

    return jsonResponse({ debug, existingUsers: listData?.users?.length || 0 });
  } catch (err) {
    return jsonResponse({ error: String(err), stack: err?.stack }, 500);
  }
});
