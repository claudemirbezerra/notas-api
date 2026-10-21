import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TaskAlreadyDoneError, TaskNotFoundError } from "../domain/errors.js";
import { createTaskSchema } from "../domain/task.js";
import { InvalidRequestError, RouteNotFoundError, parseJsonBody, toHttpError } from "./errors.js";

describe("toHttpError", () => {
  it("traduz tarefa ausente para 404", () => {
    assert.deepEqual(toHttpError(new TaskNotFoundError("4")), {
      status: 404,
      body: { error: "task_not_found", message: "Tarefa não encontrada: 4" },
    });
  });

  it("traduz tarefa já concluída para 409", () => {
    assert.deepEqual(toHttpError(new TaskAlreadyDoneError("2")), {
      status: 409,
      body: { error: "task_already_done", message: "Tarefa já concluída: 2" },
    });
  });

  it("traduz ZodError e JSON inválido para 400", () => {
    let zodError: unknown;
    try {
      createTaskSchema.parse({});
    } catch (error) {
      zodError = error;
    }

    const translated = toHttpError(zodError);
    assert.equal(translated.status, 400);
    assert.equal(translated.body.error, "validation_error");
    assert.ok(translated.body.message.length > 0);

    assert.throws(() => parseJsonBody("{"), InvalidRequestError);
    assert.deepEqual(toHttpError(new InvalidRequestError("JSON inválido")), {
      status: 400,
      body: { error: "validation_error", message: "JSON inválido" },
    });
  });

  it("traduz rota desconhecida para 404 e erro inesperado para 500", () => {
    assert.deepEqual(toHttpError(new RouteNotFoundError()), {
      status: 404,
      body: { error: "route_not_found", message: "Rota não encontrada" },
    });
    assert.deepEqual(toHttpError(new Error("falha")), {
      status: 500,
      body: { error: "internal_error", message: "Erro interno" },
    });
  });
});
