import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TaskAlreadyDoneError,
  TaskNotFoundError,
  createTaskSchema,
  taskFilterSchema,
  taskIdSchema,
} from "./task.js";

describe("createTaskSchema", () => {
  it("remove espaços nas extremidades do título", () => {
    const parsed = createTaskSchema.parse({ title: "  comprar leite  " });
    assert.deepEqual(parsed, { title: "comprar leite" });
  });

  it("descarta chaves extras", () => {
    const parsed = createTaskSchema.parse({ title: "estudar", extra: true });
    assert.deepEqual(parsed, { title: "estudar" });
  });

  it("rejeita título ausente", () => {
    const parsed = createTaskSchema.safeParse({});
    assert.equal(parsed.success, false);
  });

  it("rejeita título vazio", () => {
    const parsed = createTaskSchema.safeParse({ title: "" });
    assert.equal(parsed.success, false);
  });

  it("rejeita título só com espaços", () => {
    const parsed = createTaskSchema.safeParse({ title: "   " });
    assert.equal(parsed.success, false);
  });
});

describe("taskFilterSchema", () => {
  it("aceita all, open e done", () => {
    assert.equal(taskFilterSchema.parse("all"), "all");
    assert.equal(taskFilterSchema.parse("open"), "open");
    assert.equal(taskFilterSchema.parse("done"), "done");
  });

  it("rejeita filtro inválido", () => {
    const parsed = taskFilterSchema.safeParse("later");
    assert.equal(parsed.success, false);
  });

  it("rejeita filtro vazio", () => {
    const parsed = taskFilterSchema.safeParse("");
    assert.equal(parsed.success, false);
  });
});

describe("taskIdSchema", () => {
  it("remove espaços nas extremidades do id", () => {
    assert.equal(taskIdSchema.parse("  1  "), "1");
  });

  it("rejeita id vazio", () => {
    assert.equal(taskIdSchema.safeParse("").success, false);
    assert.equal(taskIdSchema.safeParse("   ").success, false);
  });
});

describe("erros de domínio", () => {
  it("TaskNotFoundError carrega o id ausente", () => {
    const error = new TaskNotFoundError("4");
    assert.equal(error instanceof Error, true);
    assert.equal(error.id, "4");
    assert.match(error.message, /4/);
  });

  it("TaskAlreadyDoneError carrega o id já concluído", () => {
    const error = new TaskAlreadyDoneError("2");
    assert.equal(error instanceof Error, true);
    assert.equal(error.id, "2");
    assert.match(error.message, /2/);
  });
});
