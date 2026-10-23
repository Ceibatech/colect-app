import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  TrendingUp,
  UsersRound,
  Map,
  FilePlus2,
  FolderOpen,
  ShieldCheck,
  Upload,
  Download,
  Settings,
  Users,
  Shield,
  Building2,
  MapPinned,
  Tags,
  SlidersHorizontal,
  ScrollText,
  Warehouse,
  PackageOpen,
  Wrench,
  FileStack,
  WalletCards,
  BriefcaseBusiness,
  Truck,
  ClipboardCheck,
  Search,
  ScanSearch,
} from "lucide-react";
import type { PermissionCode, RoleCode } from "@/lib/permissions/constants";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: PermissionCode;
  roles?: readonly RoleCode[];
  children?: NavItem[];
}

export function isNavItemVisible(item: NavItem, permissions: readonly PermissionCode[], roleCode: RoleCode) {
  return permissions.includes(item.permission) && (!item.roles || item.roles.includes(roleCode));
}

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Tableau de bord",
    href: "/dashboard",
    icon: LayoutDashboard,
    permission: "DASHBOARD_VIEW",
    roles: ["ADMIN", "SUPERVISEUR", "OPERATEUR", "FINANCE", "PMO", "EXECUTIF", "CONSULTATION"],
    children: [
      { title: "Vue d'ensemble", href: "/dashboard", icon: LayoutDashboard, permission: "DASHBOARD_VIEW" },
      { title: "Direction", href: "/dashboard/direction", icon: TrendingUp, permission: "DASHBOARD_VIEW", roles: ["ADMIN", "EXECUTIF", "PMO", "CONSULTATION"] },
      { title: "Opérateurs", href: "/dashboard/operateurs", icon: UsersRound, permission: "DASHBOARD_VIEW", roles: ["ADMIN", "EXECUTIF", "PMO", "SUPERVISEUR"] },
      { title: "Géographie", href: "/dashboard/geographie", icon: Map, permission: "DASHBOARD_VIEW", roles: ["ADMIN", "EXECUTIF", "PMO", "SUPERVISEUR", "CONSULTATION"] },
      { title: "Finance", href: "/dashboard/finance", icon: WalletCards, permission: "FINANCE_VIEW", roles: ["ADMIN", "FINANCE"] },
      { title: "PMO", href: "/dashboard/pmo", icon: BriefcaseBusiness, permission: "PMO_VIEW", roles: ["ADMIN", "PMO"] },
    ],
  },
  { title: "Collecte", href: "/collecte", icon: FilePlus2, permission: "DOSSIER_CREATE" },
  { title: "Dossiers", href: "/dossiers", icon: FolderOpen, permission: "DOSSIER_READ" },
  { title: "Recherche documentaire", href: "/recherche", icon: Search, permission: "DOSSIER_READ" },
  { title: "Préparation", href: "/preparation", icon: ClipboardCheck, permission: "PREPARATION_VIEW" },
  {
    title: "Transferts", href: "/transferts", icon: Truck, permission: "TRANSFER_VIEW",
    children: [
      { title: "Registre et bordereaux", href: "/transferts", icon: Truck, permission: "TRANSFER_VIEW" },
      { title: "Validation CEIBA", href: "/transferts/validation-ceibac", icon: ClipboardCheck, permission: "TRANSFER_CEIBAC_APPROVE" },
      { title: "Validation ministère", href: "/transferts/validation", icon: ShieldCheck, permission: "TRANSFER_AUTHORIZE" },
    ],
  },
  { title: "Qualité", href: "/qualite", icon: ShieldCheck, permission: "QUALITY_VIEW" },
  { title: "Import", href: "/import", icon: Upload, permission: "IMPORT_DATA" },
  { title: "Export", href: "/export", icon: Download, permission: "EXPORT_DATA" },
  {
    title: "Administration",
    href: "/administration",
    icon: Settings,
    permission: "USER_MANAGE",
    children: [
      { title: "Utilisateurs", href: "/administration/utilisateurs", icon: Users, permission: "USER_MANAGE" },
      { title: "Rôles", href: "/administration/roles", icon: Shield, permission: "ROLE_MANAGE" },
      { title: "Sites", href: "/administration/sites", icon: Warehouse, permission: "REFERENTIEL_MANAGE" },
      { title: "Salles / espaces", href: "/administration/entrepots", icon: PackageOpen, permission: "REFERENTIEL_MANAGE" },
      { title: "Équipements", href: "/administration/equipements", icon: Wrench, permission: "REFERENTIEL_MANAGE" },
      { title: "Communes", href: "/administration/communes", icon: Building2, permission: "REFERENTIEL_MANAGE" },
      { title: "Lotissements", href: "/administration/lotissements", icon: MapPinned, permission: "REFERENTIEL_MANAGE" },
      { title: "Natures de dossier", href: "/administration/natures", icon: Tags, permission: "REFERENTIEL_MANAGE" },
      { title: "Types de pièces", href: "/administration/types-piece", icon: FileStack, permission: "REFERENTIEL_MANAGE" },
      { title: "Champs d'indexation", href: "/administration/indexation", icon: ScanSearch, permission: "SETTINGS_MANAGE" },
      { title: "Paramètres", href: "/administration/parametres", icon: SlidersHorizontal, permission: "SETTINGS_MANAGE" },
      { title: "Audit", href: "/administration/audit", icon: ScrollText, permission: "AUDIT_VIEW" },
    ],
  },
];
