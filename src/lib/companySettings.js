import { supabase } from "./supabase";

export async function getCompanySettings() {
  const { data } = await supabase.from("app_settings").select("*");
  if (!data) return {};
  const map = {};
  data.forEach(r => { map[r.key] = r.value; });
  return map;
}

export async function saveCompanySetting(key, value) {
  await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
}
