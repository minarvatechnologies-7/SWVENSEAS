import { supabase } from "./supabase";

const DEFAULT_GROUPS = ["Group 1", "Group 2", "Group 3", "Group 4", "Group 5", "Group 6"];
const SETTINGS_KEY = "employee_groups";

// Load group list (from app_settings, fallback to defaults)
export async function getGroups() {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .single();
    if (data && data.value) {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_GROUPS;
}

// Save group list to app_settings
export async function saveGroups(groups) {
  try {
    const value = JSON.stringify(groups);
    // Upsert (insert or update)
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: SETTINGS_KEY, value }, { onConflict: "key" });
    if (error) {
      // Fallback: try update then insert
      const upd = await supabase.from("app_settings").update({ value }).eq("key", SETTINGS_KEY);
      if (upd.error) await supabase.from("app_settings").insert({ key: SETTINGS_KEY, value });
    }
    return true;
  } catch (e) {
    console.error("saveGroups failed:", e);
    return false;
  }
}
