"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getDossierWorkspaceActivityPath, getWorkspaceTheme } from "@/config/workspace-theme";
import type { PermissionCode, RoleCode } from "@/lib/permissions/constants";

const WorkspaceContext = createContext<ReturnType<typeof getWorkspaceTheme> | null>(null);
interface WorkspaceActivity { pathname: string; activityPath: string }
type RegisterWorkspaceActivity = (pathname: string, activityPath: string) => () => void;
const WorkspaceActivityContext = createContext<RegisterWorkspaceActivity | null>(null);

export function useWorkspaceTheme() {
  return useContext(WorkspaceContext);
}

/** Changes presentation only; the dossier's tab and permission checks remain independent. */
export function useDossierWorkspaceActivity(tab: string) {
  const pathname = usePathname();
  const register = useContext(WorkspaceActivityContext);
  const activityPath = getDossierWorkspaceActivityPath(pathname, tab);
  useEffect(() => {
    if (!register || !activityPath) return;
    return register(pathname, activityPath);
  }, [register, pathname, activityPath]);
}

export function WorkspaceTheme({ roleCode, permissions, children }: {
  roleCode: RoleCode; permissions: readonly PermissionCode[]; children: ReactNode;
}) {
  const pathname = usePathname();
  const [activity, setActivity] = useState<WorkspaceActivity | null>(null);
  const register = useCallback<RegisterWorkspaceActivity>((sourcePathname, activityPath) => {
    const registration = { pathname: sourcePathname, activityPath };
    setActivity(registration);
    return () => setActivity((current) => current === registration ? null : current);
  }, []);
  // A persisted layout must never carry a dossier's tab accent into another page.
  const effectivePathname = activity?.pathname === pathname ? activity.activityPath : pathname;
  const theme = getWorkspaceTheme(roleCode, permissions, effectivePathname);
  return (
    <WorkspaceContext.Provider value={theme}>
      <WorkspaceActivityContext.Provider value={register}>
        <div className="contents" data-workspace-role={theme.rolePalette.key} data-workspace-theme={theme.activePalette.key}>
          {children}
        </div>
      </WorkspaceActivityContext.Provider>
    </WorkspaceContext.Provider>
  );
}
