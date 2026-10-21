import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runCli, type CliIo } from "./cli.js";
import { TaskService } from "./service/task-service.js";
import { MemoryTaskStore } from "./store/memory-task-store.js";

function run(argv: string[], tasks = new TaskService(new MemoryTaskStore())) {
  let stdout = "";
  let stderr = "";
  const io: CliIo = {
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
  };
  const code = runCli(argv, tasks, io);
  return { code, stdout, stderr, tasks };
}

describe("CLI criar e listar", () => {
  it("cria uma tarefa com título sem espaços nas pontas", () => {
    const result = run(["create", "--title", "  comprar leite  "]);

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), {
      id: "1",
      title: "comprar leite",
      status: "open",
    });
  });

  it("rejeita título inválido sem alterar o store", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    tasks.createTask("fica");
    const before = tasks.listTasks("all");

    const result = run(["create", "--title", "   "], tasks);

    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).error, "validation_error");
    assert.deepEqual(tasks.listTasks("all"), before);
  });

  it("lista sem filtro, all, open e done", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    const older = tasks.createTask("mais antiga");
    const middle = tasks.createTask("do meio");
    tasks.completeTask(middle.id);
    const newer = tasks.createTask("mais nova");

    const withoutFilter = run(["list"], tasks);
    const all = run(["list", "--status", "all"], tasks);
    const open = run(["list", "--status", "open"], tasks);
    const done = run(["list", "--status", "done"], tasks);

    assert.equal(withoutFilter.code, 0);
    assert.equal(all.code, 0);
    assert.deepEqual(JSON.parse(withoutFilter.stdout), { tasks: tasks.listTasks("all") });
    assert.deepEqual(JSON.parse(all.stdout), { tasks: tasks.listTasks("all") });
    assert.deepEqual(JSON.parse(open.stdout), {
      tasks: [
        { id: older.id, title: "mais antiga", status: "open" },
        { id: newer.id, title: "mais nova", status: "open" },
      ],
    });
    assert.deepEqual(JSON.parse(done.stdout), {
      tasks: [{ id: middle.id, title: "do meio", status: "done" }],
    });
  });

  it("pede --title quando a flag não vem", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    const result = run(["create"], tasks);

    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).error, "usage_error");
    assert.deepEqual(tasks.listTasks("all"), []);
  });

  it("rejeita filtro inválido", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    tasks.createTask("aberta");
    const before = tasks.listTasks("all");

    const result = run(["list", "--status", "later"], tasks);

    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).error, "validation_error");
    assert.deepEqual(tasks.listTasks("all"), before);
  });
});
