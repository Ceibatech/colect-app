"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Bouton flottant d'accès rapide à une nouvelle Collecte, visible depuis
 * n'importe quel module de l'application (tableau de bord, dossiers,
 * qualité...). Pointe toujours vers "/collecte/nouveau" — jamais "/collecte"
 * seul — pour ouvrir directement le formulaire, sans passer par l'écran
 * intermédiaire de reprise de brouillon qui s'affiche sur "/collecte" quand
 * des brouillons existent déjà (cf. src/app/(app)/collecte/page.tsx).
 *
 * Masqué sur les pages de collecte elles-mêmes (redondant avec le contenu de
 * la page). Le rendu conditionnel selon la permission DOSSIER_CREATE se fait
 * dans le layout serveur appelant, pas ici — cf. (app)/layout.tsx.
 */
export function CollecteFab() {
  const pathname = usePathname();
  if (pathname.startsWith("/collecte")) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href="/collecte/nouveau"
            aria-label="Nouvelle collecte"
            className={cn(
              buttonVariants({ size: "icon-lg" }),
              "fixed right-6 bottom-6 z-40 size-14 rounded-full shadow-lg transition-transform hover:scale-105"
            )}
          >
            <FilePlus2 className="size-6" />
          </Link>
        }
      />
      <TooltipContent side="left">Nouvelle collecte</TooltipContent>
    </Tooltip>
  );
}
