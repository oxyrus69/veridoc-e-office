import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Database } from "@/server/db";

export const SETTING_KEYS = {
  slaHours: "sla_hours_per_step",
  orgName: "org_name",
  orgUnit: "org_unit",
  verifyBaseUrl: "verify_base_url",
  retainAuditDays: "retain_audit_days",
  requirePinFinal: "require_pin_final",
} as const;

const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.slaHours]: "24",
  [SETTING_KEYS.orgName]: "VeriDoc Nusantara",
  [SETTING_KEYS.orgUnit]: "Sekretariat Direksi",
  [SETTING_KEYS.verifyBaseUrl]: "https://veridoc.id",
  [SETTING_KEYS.retainAuditDays]: "365",
  [SETTING_KEYS.requirePinFinal]: "true",
};

export async function getSettings(db?: Database): Promise<Record<string, string>> {
  const database = db ?? (await getDb());
  const rows = await database.select().from(schema.appSettings);
  const result = { ...DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}

export async function getSetting(key: string, db?: Database): Promise<string> {
  const database = db ?? (await getDb());
  const [row] = await database.select().from(schema.appSettings).where(eq(schema.appSettings.key, key)).limit(1);
  return row?.value ?? DEFAULTS[key] ?? "";
}

export async function saveSetting(params: { key: string; value: string; label?: string; db?: Database }) {
  const db = params.db ?? (await getDb());
  await db
    .insert(schema.appSettings)
    .values({ key: params.key, value: params.value, label: params.label ?? "" })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: params.value, updatedAt: new Date(), label: params.label ?? "" },
    });
}

export async function saveSettings(entries: { key: string; value: string; label?: string }[], db?: Database) {
  for (const entry of entries) await saveSetting({ ...entry, db });
}
