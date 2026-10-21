import { AppError, toErrorBody, type ErrorBody } from "../domain/errors.js";

const statusByCode: Record<string, number> = {
  validation_error: 400,
  task_not_found: 404,
  task_already_done: 409,
  route_not_found: 404,
};

export class InvalidRequestError extends AppError {
  readonly code = "validation_error";

  constructor(message: string) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

export class RouteNotFoundError extends AppError {
  readonly code = "route_not_found";

  constructor() {
    super("Rota não encontrada");
    this.name = "RouteNotFoundError";
  }
}

export function parseJsonBody(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidRequestError("JSON inválido");
  }
}

export function toHttpError(error: unknown): { status: number; body: ErrorBody } {
  const body = toErrorBody(error);
  return {
    status: statusByCode[body.error] ?? 500,
    body,
  };
}
