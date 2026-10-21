import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AppError,
  InvalidTaskMemoryError,
  TaskAlreadyDoneError,
  TaskMemoryIoError,
  TaskNotFoundError,
  toErrorBody,
} from "./errors.js";

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

  it("InvalidTaskMemoryError usa código e mensagem fixos", () => {
    const error = new InvalidTaskMemoryError();
    assert.equal(error instanceof AppError, true);
    assert.equal(error.code, "invalid_task_memory");
    assert.equal(error.message, "tasks.json não contém uma lista de tarefas válida");
    assert.deepEqual(toErrorBody(error), {
      error: "invalid_task_memory",
      message: "tasks.json não contém uma lista de tarefas válida",
    });
  });

  it("TaskMemoryIoError distingue falha de leitura e de gravação", () => {
    const read = new TaskMemoryIoError("read");
    const write = new TaskMemoryIoError("write");
    assert.equal(read instanceof AppError, true);
    assert.equal(write instanceof AppError, true);
    assert.equal(read.code, "task_memory_io");
    assert.equal(write.code, "task_memory_io");
    assert.deepEqual(toErrorBody(read), {
      error: "task_memory_io",
      message: "Não foi possível ler tasks.json",
    });
    assert.deepEqual(toErrorBody(write), {
      error: "task_memory_io",
      message: "Não foi possível gravar tasks.json",
    });
  });
});
