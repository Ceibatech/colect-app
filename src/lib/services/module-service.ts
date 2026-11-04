"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma/client";
import { APP_MODULES, DISABLED_MODULES_SETTING, parseDisabledModules } from "@/lib/modules/catalog";
import { forgetDisabledModulesCache } from "@/lib/modules/state";

export interface ModuleActionState {
  error?: string;
  message?: string;
}

/** Met un module hors service, ou le remet en service, sans redéployer. */
export async function setModuleAvailability(_previous: ModuleActionState, formData: FormData): Promise<ModuleActionState> {
  const session = await requirePermission("SETTINGS_MANAGE");
  const code = String(formData.get("module") ?? "");
  const enable = formData.get("enable") === "1";
  const motif = String(formData.get("motif") ?? "").trim().slice(0, 300) || null;
  const mod = APP_MODULES.find((item) => item.code === code);
  if (!mod) return { error: "Module inconnu." };

  await prisma.$transaction(async (tx) => {
    const current = await tx.setting.findUnique({ where: { key: DISABLED_MODULES_SETTING }, select: { value: true } });
    const disabled = parseDisabledModules(current?.value);
    const before = disabled[code] ?? null;
    if (enable) delete disabled[code];
    else disabled[code] = { at: new Date().toISOString(), by: session.name, motif };
    const value = JSON.stringify(disabled);
    await tx.setting.upsert({
      where: { key: DISABLED_MODULES_SETTING },
      create: { key: DISABLED_MODULES_SETTING, value, description: "Modules mis hors service par l'administrateur (sans redéploiement)." },
      update: { value },
    });
    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: enable ? "MODULE_ENABLE" : "MODULE_DISABLE",
        entity: "MODULE",
        oldValue: { module: code, horsService: before !== null },
        newValue: { module: code, horsService: !enable, motif },
      },
    });
  });

  forgetDisabledModulesCache();
  revalidatePath("/", "layout");
  return { message: enable ? `${mod.label} est remis en service.` : `${mod.label} est hors service. Les autres modules continuent de fonctionner.` };
}
