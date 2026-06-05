const { createClient } = require("@supabase/supabase-js");

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY is not set. Backend may not bypass RLS.");
} else if (serviceRoleKey.startsWith("sb_publishable_")) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY appears to be a publishable key. Use the service role key from Supabase project settings.");
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    serviceRoleKey
);

module.exports = supabase;