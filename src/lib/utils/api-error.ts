/**
 * Erreur "attendue" à destination d'une Route Handler (API REST) : précondition
 * métier non remplie, ressource introuvable, permission refusée... Distincte
 * d'une erreur serveur inattendue, pour répondre avec le bon code HTTP
 * (400/401/403/404) plutôt qu'un 500 générique.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
