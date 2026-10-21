import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createTaskSchema, taskFilterSchema, taskIdSchema, taskMemorySchema } from "./task.js";

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

describe("taskMemorySchema", () => {
  it("aceita a lista na ordem do array, inclusive vazia", () => {
    const tasks = [
      { id: "1", title: "mais antiga", status: "open" },
      { id: "2", title: "mais nova", status: "done" },
    ];

    assert.deepEqual(taskMemorySchema.parse(tasks), tasks);
    assert.deepEqual(taskMemorySchema.parse([]), []);
  });

  it("rejeita raiz que não é array", () => {
    assert.equal(taskMemorySchema.safeParse({ tasks: [] }).success, false);
    assert.equal(taskMemorySchema.safeParse(null).success, false);
    assert.equal(taskMemorySchema.safeParse("[]").success, false);
  });

  it("rejeita chave extra", () => {
    const parsed = taskMemorySchema.safeParse([
      { id: "1", title: "estudar", status: "open", extra: true },
    ]);
    assert.equal(parsed.success, false);
  });

  it("rejeita título ausente, vazio, só com espaços ou com espaço na ponta", () => {
    assert.equal(taskMemorySchema.safeParse([{ id: "1", status: "open" }]).success, false);
    assert.equal(
      taskMemorySchema.safeParse([{ id: "1", title: "", status: "open" }]).success,
      false,
    );
    assert.equal(
      taskMemorySchema.safeParse([{ id: "1", title: "   ", status: "open" }]).success,
      false,
    );
    assert.equal(
      taskMemorySchema.safeParse([{ id: "1", title: " comprar leite ", status: "open" }]).success,
      false,
    );
  });

  it("rejeita id vazio ou com espaço na ponta", () => {
    assert.equal(
      taskMemorySchema.safeParse([{ id: "", title: "estudar", status: "open" }]).success,
      false,
    );
    assert.equal(
      taskMemorySchema.safeParse([{ id: " 1 ", title: "estudar", status: "open" }]).success,
      false,
    );
  });

  it("rejeita estado fora de open e done", () => {
    const parsed = taskMemorySchema.safeParse([{ id: "1", title: "estudar", status: "later" }]);
    assert.equal(parsed.success, false);
  });

  it("rejeita ids repetidos", () => {
    const parsed = taskMemorySchema.safeParse([
      { id: "1", title: "uma", status: "open" },
      { id: "1", title: "outra", status: "done" },
    ]);
    assert.equal(parsed.success, false);
  });
});
