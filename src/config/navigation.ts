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
  MailCheck,
  ScanLine,
  PackageCheck,
  Archive,
  Container,
  Navigation,
  QrCode,
} from "lucide-react";
import type { PermissionCode, RoleCode } from "@/lib/permissions/constants";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  permission: PermissionCode;
  roles?: readonly RoleCode[];
  children?: NavItem[];
  tone?: ActivityTone;
}

export type ActivityTone = "dashboard" | "collecte" | "dossiers" | "preparation" | "numerisation" | "conditionnement" | "indexation" | "archivage" | "transfer" | "quality" | "admin";

export function isNavItemVisible(item: NavItem, permissions: readonly PermissionCode[], roleCode: RoleCode) {
  return permissions.includes(item.permission) && (!item.roles || item.roles.includes(roleCode));
}

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Tableau de bord",
    href: "/dashboard",
    icon: LayoutDashboard,
    tone: "dashboard",
    permission: "DASHBOARD_VIEW",
    roles: ["ADMIN", "SUPERVISEUR", "OPERATEUR", "AGENT_INVENTAIRE", "PREPARATEUR", "NUMERISATEUR", "CONDITIONNEUR", "INDEXEUR", "ARCHIVISTE", "FINANCE", "PMO", "EXECUTIF", "CONSULTATION"],
    children: [
      { title: "Vue d'ensemble", href: "/dashboard", icon: LayoutDashboard, permission: "DASHBOARD_VIEW" },
      { title: "Direction", href: "/dashboard/direction", icon: TrendingUp, permission: "DASHBOARD_VIEW", roles: ["ADMIN", "EXECUTIF", "PMO", "CONSULTATION"] },
      { title: "Opérateurs", href: "/dashboard/operateurs", icon: UsersRound, permission: "DASHBOARD_VIEW", roles: ["ADMIN", "EXECUTIF", "PMO", "SUPERVISEUR"] },
      { title: "Géographie", href: "/dashboard/geographie", icon: Map, permission: "DASHBOARD_VIEW", roles: ["ADMIN", "EXECUTIF", "PMO", "SUPERVISEUR", "CONSULTATION"] },
      { title: "Finance", href: "/dashboard/finance", icon: WalletCards, permission: "FINANCE_VIEW", roles: ["ADMIN", "FINANCE"] },
      { title: "PMO", href: "/dashboard/pmo", icon: BriefcaseBusiness, permission: "PMO_VIEW", roles: ["ADMIN", "PMO"] },
    ],
  },
  { title: "Collecte", href: "/collecte", icon: FilePlus2, permission: "DOSSIER_CREATE", tone: "collecte" },
  { title: "Dossiers", href: "/dossiers", icon: FolderOpen, permission: "DOSSIER_READ", roles: ["ADMIN", "SUPERVISEUR", "OPERATEUR", "AGENT_INVENTAIRE", "CONSULTATION"], tone: "dossiers" },
  { title: "Recherche documentaire", href: "/recherche", icon: Search, permission: "DOSSIER_READ", roles: ["ADMIN", "SUPERVISEUR", "OPERATEUR", "AGENT_INVENTAIRE", "EXECUTIF", "PMO", "CONSULTATION"], tone: "dossiers" },
  { title: "Cartons et QR codes", href: "/cartons", icon: QrCode, permission: "DOSSIER_READ", tone: "dossiers" },
  { title: "Préparation", href: "/preparation", icon: ClipboardCheck, permission: "PREPARATION_VIEW", tone: "preparation" },
  { title: "Numérisation", href: "/numerisation", icon: ScanLine, permission: "NUMERISATION_VIEW", tone: "numerisation" },
  { title: "Reconditionnement", href: "/conditionnement", icon: PackageCheck, permission: "CONDITIONNEMENT_VIEW", tone: "conditionnement" },
  { title: "Caisses", href: "/caisses", icon: Container, permission: "CONDITIONNEMENT_VIEW", tone: "conditionnement" },
  { title: "Indexation", href: "/indexation", icon: ScanSearch, permission: "INDEXATION_VIEW", tone: "indexation" },
  { title: "Archivage", href: "/archivage", icon: Archive, permission: "ARCHIVAGE_VIEW", tone: "archivage" },
  {
    title: "Transferts", href: "/transferts", icon: Truck, permission: "TRANSFER_VIEW", tone: "transfer",
    children: [
      { title: "Registre et bordereaux", href: "/transferts", icon: Truck, permission: "TRANSFER_VIEW" },
      { title: "Mon site", href: "/transferts/mon-site", icon: MapPinned, permission: "TRANSFER_OPERATE" },
      { title: "Mes convois", href: "/transferts/convois", icon: Navigation, permission: "TRANSFER_TRACK" },
      { title: "Validation interne", href: "/transferts/validation-ceibac", icon: ClipboardCheck, permission: "TRANSFER_CEIBAC_APPROVE" },
      { title: "Validation SDA", href: "/transferts/validation", icon: ShieldCheck, permission: "TRANSFER_AUTHORIZE" },
    ],
  },
  { title: "Qualité", href: "/qualite", icon: ShieldCheck, permission: "QUALITY_VIEW", tone: "quality" },
  { title: "Import", href: "/import", icon: Upload, permission: "IMPORT_DATA", tone: "admin" },
  { title: "Export", href: "/export", icon: Download, permission: "EXPORT_DATA", tone: "admin" },
  {
    title: "Administration",
    href: "/administration",
    icon: Settings,
    permission: "USER_MANAGE",
    tone: "admin",
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
      { title: "Rapports par e-mail", href: "/administration/rapports-email", icon: MailCheck, permission: "SETTINGS_MANAGE" },
      { title: "Paramètres", href: "/administration/parametres", icon: SlidersHorizontal, permission: "SETTINGS_MANAGE" },
      { title: "Audit", href: "/administration/audit", icon: ScrollText, permission: "AUDIT_VIEW" },
    ],
  },
];
