import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Task } from "../domain/task.js";
import { MemoryTaskStore } from "./memory-task-store.js";

function task(id: string, title: string, status: Task["status"] = "open"): Task {
  return { id, title, status };
}

describe("MemoryTaskStore", () => {
  it("lista na ordem de inserção", () => {
    const store = new MemoryTaskStore();
    store.insert(task("1", "mais antiga"));
    store.insert(task("2", "do meio", "done"));
    store.insert(task("3", "mais nova"));

    const listed = store.list();
    assert.deepEqual(
      listed.map((item) => item.id),
      ["1", "2", "3"],
    );

    listed.pop();
    assert.deepEqual(
      store.list().map((item) => item.id),
      ["1", "2", "3"],
    );
  });

  it("não reutiliza o id removido", () => {
    const store = new MemoryTaskStore();
    const first = store.allocateId();
    store.insert(task(first, "a"));
    const second = store.allocateId();
    store.insert(task(second, "b"));

    store.delete(first);

    const third = store.allocateId();
    assert.equal(first, "1");
    assert.equal(second, "2");
    assert.equal(third, "3");
    assert.equal(store.findById(first), undefined);
    assert.deepEqual(
      store.list().map((item) => item.id),
      [second],
    );
  });

  it("atualiza a tarefa na mesma posição", () => {
    const store = new MemoryTaskStore();
    store.insert(task("1", "a"));
    store.insert(task("2", "b", "open"));
    store.insert(task("3", "c"));

    store.update(task("2", "b revista", "done"));

    assert.deepEqual(store.list(), [
      task("1", "a"),
      task("2", "b revista", "done"),
      task("3", "c"),
    ]);
  });

  it("remove a tarefa e preserva a ordem das demais", () => {
    const store = new MemoryTaskStore();
    store.insert(task("1", "a"));
    store.insert(task("2", "b"));
    store.insert(task("3", "c"));

    store.delete("2");

    assert.deepEqual(store.list(), [task("1", "a"), task("3", "c")]);
    assert.equal(store.findById("2"), undefined);
  });

  it("devolve ausência quando o id não existe", () => {
    const store = new MemoryTaskStore();
    assert.equal(store.findById("9"), undefined);
  });

  it("isola tarefas entre duas instâncias", () => {
    const first = new MemoryTaskStore();
    const second = new MemoryTaskStore();

    first.insert(task(first.allocateId(), "só na primeira"));

    assert.deepEqual(second.list(), []);
    assert.equal(second.allocateId(), "1");
    assert.equal(first.findById("1")?.title, "só na primeira");
  });
});
