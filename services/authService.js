const supabase = require("../supabase");
const { verifyLineToken } = require("./lineAuth");

async function upsertUserFromLine(id_token) {
  const decoded = await verifyLineToken(id_token);
  const payload = {
    line_id: decoded.sub,
    display_name: decoded.name ?? null,
    picture_url: decoded.picture ?? null,
    email: decoded.email ?? null,
  };

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "line_id" })
    .select();

  if (error) throw error;

  return data?.[0] || null;
}

async function getUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("display_name", { ascending: true });

  if (error) throw error;

  return data || [];
}

async function getUserByLineId(lineId) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("line_id", lineId)
    .limit(1);

  if (error) throw error;

  return data?.[0] || null;
}

module.exports = {
  upsertUserFromLine,
  getUsers,
  getUserByLineId,
};