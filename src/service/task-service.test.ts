import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TaskAlreadyDoneError,
  TaskNotFoundError,
  type Task,
} from "../domain/task.js";
import { MemoryTaskStore } from "../store/memory-task-store.js";
import type { TaskStore } from "../store/task-store.js";
import { TaskService } from "./task-service.js";

function service(): TaskService {
  return new TaskService(new MemoryTaskStore());
}

describe("TaskService", () => {
  it("cria a tarefa open com o id do store", () => {
    const tasks = service();
    const created = tasks.createTask("comprar leite");

    assert.deepEqual(created, {
      id: "1",
      title: "comprar leite",
      status: "open",
    });
  });

  it("aceita títulos iguais com ids diferentes", () => {
    const tasks = service();
    const first = tasks.createTask("estudar");
    const second = tasks.createTask("estudar");

    assert.equal(first.title, second.title);
    assert.notEqual(first.id, second.id);
    assert.deepEqual(
      tasks.listTasks("all").map((task) => task.id),
      [first.id, second.id],
    );
  });

  it("lista all, open e done na ordem de criação, inclusive vazia", () => {
    const tasks = service();
    assert.deepEqual(tasks.listTasks("all"), []);
    assert.deepEqual(tasks.listTasks("open"), []);
    assert.deepEqual(tasks.listTasks("done"), []);

    const older = tasks.createTask("mais antiga");
    const middle = tasks.createTask("do meio");
    tasks.completeTask(middle.id);
    const newer = tasks.createTask("mais nova");

    assert.deepEqual(
      tasks.listTasks("all").map((task) => task.id),
      [older.id, middle.id, newer.id],
    );
    assert.deepEqual(
      tasks.listTasks("open").map((task) => task.title),
      ["mais antiga", "mais nova"],
    );
    assert.deepEqual(
      tasks.listTasks("done").map((task) => task.title),
      ["do meio"],
    );
  });

  it("conclui uma tarefa open e mantém o título", () => {
    const tasks = service();
    const created = tasks.createTask("  título já validado  ");
    const completed = tasks.completeTask(created.id);

    assert.deepEqual(completed, {
      id: created.id,
      title: created.title,
      status: "done",
    });
    assert.deepEqual(tasks.listTasks("done"), [completed]);
    assert.deepEqual(tasks.listTasks("open"), []);
  });

  it("recusa concluir uma tarefa done sem alterar o store", () => {
    const tasks = service();
    const created = tasks.createTask("pronta");
    tasks.completeTask(created.id);
    const before = tasks.listTasks("all");

    assert.throws(
      () => tasks.completeTask(created.id),
      (error: unknown) => {
        assert.ok(error instanceof TaskAlreadyDoneError);
        assert.equal(error.id, created.id);
        return true;
      },
    );
    assert.deepEqual(tasks.listTasks("all"), before);
  });

  it("recusa concluir ou remover um id ausente", () => {
    const tasks = service();
    tasks.createTask("existente");
    const before = tasks.listTasks("all");

    assert.throws(
      () => tasks.completeTask("99"),
      (error: unknown) => {
        assert.ok(error instanceof TaskNotFoundError);
        assert.equal(error.id, "99");
        return true;
      },
    );
    assert.throws(
      () => tasks.removeTask("99"),
      (error: unknown) => {
        assert.ok(error instanceof TaskNotFoundError);
        assert.equal(error.id, "99");
        return true;
      },
    );
    assert.deepEqual(tasks.listTasks("all"), before);
  });

  it("remove a tarefa das três listagens e o id segue ausente", () => {
    const tasks = service();
    const open = tasks.createTask("aberta");
    const done = tasks.createTask("fechada");
    tasks.completeTask(done.id);

    tasks.removeTask(open.id);
    tasks.removeTask(done.id);

    assert.deepEqual(tasks.listTasks("all"), []);
    assert.deepEqual(tasks.listTasks("open"), []);
    assert.deepEqual(tasks.listTasks("done"), []);

    assert.throws(() => tasks.completeTask(open.id), TaskNotFoundError);
    assert.throws(() => tasks.removeTask(done.id), TaskNotFoundError);
  });

  it("observa allocateId e insert no store falso ao criar", () => {
    const calls: string[] = [];
    const store: TaskStore = {
      allocateId() {
        calls.push("allocateId");
        return "7";
      },
      insert(task: Task) {
        calls.push(`insert:${task.id}:${task.status}:${task.title}`);
      },
      list() {
        return [];
      },
      findById() {
        return undefined;
      },
      update() {},
      delete() {},
    };

    const created = new TaskService(store).createTask("via falso");

    assert.deepEqual(created, {
      id: "7",
      title: "via falso",
      status: "open",
    });
    assert.deepEqual(calls, ["allocateId", "insert:7:open:via falso"]);
  });
});
