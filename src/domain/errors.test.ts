import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError, TaskAlreadyDoneError, TaskNotFoundError } from "./errors.js";

describe("erros de domínio", () => {
  it("TaskNotFoundError carrega o código e o id ausente", () => {
    const error = new TaskNotFoundError("4");
    assert.equal(error instanceof AppError, true);
    assert.equal(error.code, "task_not_found");
    assert.equal(error.id, "4");
    assert.match(error.message, /4/);
  });

  it("TaskAlreadyDoneError carrega o código e o id já concluído", () => {
    const error = new TaskAlreadyDoneError("2");
    assert.equal(error instanceof AppError, true);
    assert.equal(error.code, "task_already_done");
    assert.equal(error.id, "2");
    assert.match(error.message, /2/);
  });
});
