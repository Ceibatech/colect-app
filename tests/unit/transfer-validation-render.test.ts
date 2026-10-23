import { createElement, type AnchorHTMLAttributes, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorization: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/lib/services/transfer-service", () => ({ getTransferAuthorization: mocks.authorization }));
vi.mock("@/components/transferts/PrintButton", () => ({
  PrintButton: () => createElement("button", null, "Imprimer"),
}));
vi.mock("@/components/transferts/TransferActions", () => ({
  ApproveTransferLotByCeibacButton: ({ lotId }: { lotId: number }) => createElement("button", { "data-ceibac-lot": lotId }, "Valider CEIBAC"),
  AuthorizeTransferButton: ({ lotId }: { lotId: number }) => createElement("button", { "data-ministry-lot": lotId }, "Autoriser"),
  ReceptionApprovalDialog: ({ movementId, stage }: { movementId: number; stage: string }) =>
    createElement("button", { "data-reception": `${stage}:${movementId}` }, "Signer réception"),
}));

import { TransferValidationWorkspace } from "@/components/transferts/TransferValidationWorkspace";
import TransferAuthorizationPage from "@/app/(print)/transferts/[id]/autorisation/page";

type WorkspaceProps = ComponentProps<typeof TransferValidationWorkspace>;
type Movement = WorkspaceProps["data"]["movements"][number];
const date = new Date("2026-10-23T10:00:00Z");

function movement(id: number, type: Movement["type"], status: Movement["status"]): Movement {
  return {
    id, reference: `BTR-${id}`, type, status, occurredAt: date, createdAt: date,
    dossierCount: 2, items: [], signatures: [],
    transferLot: { id: 12, reference: "LOT-12", sourceSite: { nom: "Ministère" }, destinationSite: { nom: "CEIBAC" } },
  };
}

function workspaceData(movements: Movement[] = []): WorkspaceProps["data"] {
  return {
    summary: { pendingLots: 1, pendingReceptions: 1, awaitingCeibac: 1 },
    lots: [{ id: 12, reference: "LOT-12", createdAt: date, source: "Ministère", destination: "CEIBAC", dossierCount: 2 }],
    movements, total: movements.length, page: 1, totalPages: 1,
  };
}

function printLot() {
  return {
    id: 12, reference: "LOT-12", authorizedAt: null,
    sourceSite: { nom: "Ministère" }, destinationSite: { nom: "CEIBAC" },
    sourceEntrepot: null, destinationEntrepot: null,
    createdBy: { name: "Gestionnaire" }, authorizedBy: null,
    motif: null, ceibacValidatedAt: null, ceibacSignatoryName: null, ceibacSignatoryTitle: null, ceibacSignatureData: null,
    approvalSignatoryName: null, approvalSignatoryTitle: null, approvalSignatureData: null,
    items: [{ id: 51, cartonCode: "CT-51", cartonLabel: "Archives", dossierCountSnapshot: 2, dossiers: [{ dossier: { reference: "DOS-1" } }, { dossier: { reference: "DOS-2" } }] }],
  };
}

describe("transfer validation workspace rendering", () => {
  it("only offers the ministry signature for CEIBAC-validated receptions", () => {
    const data = workspaceData([
      movement(1, "RECEPTION", "VALIDE_CEIBAC"),
      movement(2, "RECEPTION", "SOUMIS_CEIBAC"),
      movement(3, "RECEPTION", "VALIDE_MINISTERE"),
      movement(4, "SORTIE", "VALIDE_CEIBAC"),
      movement(5, "RETOUR", "VALIDE_CEIBAC"),
      movement(6, "RECEPTION", "REJETE"),
    ]);
    const html = renderToStaticMarkup(createElement(TransferValidationWorkspace, {
      data, filters: { statut: "TOUS", page: 1 }, stage: "MINISTERE",
    }));
    expect(html.match(/data-reception="[^"]+"/g)).toEqual(['data-reception="MINISTERE:1"']);
    for (const entry of data.movements) expect(html).toContain(`href="/transferts/12/bordereaux/${entry.id}"`);
  });

  it("exposes the lot sheet before any movement and keeps historical filters accessible", () => {
    const html = renderToStaticMarkup(createElement(TransferValidationWorkspace, {
      data: workspaceData(), filters: { statut: "A_VALIDER", q: "LOT-12", page: 1 }, stage: "MINISTERE",
    }));
    expect(html).toContain('href="/transferts/12/autorisation"');
    expect(html).toContain("Fiche du lot");
    expect(html).toContain('data-ministry-lot="12"');
    expect(html).toContain("Aucun bordereau ne correspond");
    expect(html).toContain('href="/transferts/validation?statut=VALIDES&amp;q=LOT-12"');
    expect(html).toContain('href="/transferts/validation?statut=TOUS&amp;q=LOT-12"');
    expect(html).not.toContain("data-reception=");
  });

  it("offers CEIBAC lot and arrival approvals in the CEIBAC workspace", () => {
    const data = workspaceData([movement(1, "RECEPTION", "SOUMIS_CEIBAC"), movement(2, "RECEPTION", "VALIDE_CEIBAC")]);
    data.totalPages = 2;
    const html = renderToStaticMarkup(createElement(TransferValidationWorkspace, {
      data, filters: { statut: "ATTENTE_CEIBAC", page: 1 }, stage: "CEIBAC",
    }));
    expect(html).toContain('data-ceibac-lot="12"');
    expect(html).not.toContain("data-ministry-lot=");
    expect(html.match(/data-reception="[^"]+"/g)).toEqual(['data-reception="CEIBAC:1"']);
    expect(html).toContain('href="/transferts/validation-ceibac?statut=ATTENTE_CEIBAC&amp;page=2"');
  });
});

describe("transfer lot print rendering", () => {
  beforeEach(() => { mocks.authorization.mockReset(); });

  it("clearly labels an unsigned lot as a project without implying authorization", async () => {
    mocks.authorization.mockResolvedValue(printLot());
    const html = renderToStaticMarkup(await TransferAuthorizationPage({ params: Promise.resolve({ id: "12" }) }));
    expect(mocks.authorization).toHaveBeenCalledWith(12);
    expect(html).toContain("Fiche de lot à valider");
    expect(html).toContain("PROJET — SORTIE NON AUTORISÉE");
    expect(html).toContain("Composition à contrôler");
    expect(html).toContain("En attente de validation CEIBAC.");
    expect(html).toContain("En attente d’autorisation du ministère.");
    expect(html).not.toContain("Autorisation enregistrée et traçable");
    expect(html).not.toContain("Composition autorisée");
    expect(html).not.toContain("Signé le");
    expect(html).not.toContain("<img");
  });

  it("prints an old authorization without inventing the absent CEIBAC visa", async () => {
    mocks.authorization.mockResolvedValue({
      ...printLot(), authorizedAt: date, authorizedBy: { name: "Responsable historique" },
    });
    const html = renderToStaticMarkup(await TransferAuthorizationPage({ params: Promise.resolve({ id: "12" }) }));
    expect(html).toContain("Autorisation de sortie et de transfert");
    expect(html).toContain("Autorisation enregistrée et traçable");
    expect(html).toContain("Ancien circuit : visa CEIBAC non enregistré.");
    const ceibacVisa = html.match(/Visa du responsable CEIBAC([\s\S]*?)Visa du responsable ministère/)?.[1];
    expect(ceibacVisa).toBeDefined();
    expect(ceibacVisa).not.toContain("Signé le");
    expect(ceibacVisa).not.toContain("Responsable historique");
    expect(ceibacVisa).not.toContain("<img");
  });
});
