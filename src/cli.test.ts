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

describe("CLI concluir, remover e uso", () => {
  it("conclui uma tarefa open", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    run(["create", "--title", "comprar leite"], tasks);

    const completed = run(["complete", "--id", "1"], tasks);

    assert.equal(completed.code, 0);
    assert.equal(completed.stderr, "");
    assert.deepEqual(JSON.parse(completed.stdout), {
      id: "1",
      title: "comprar leite",
      status: "done",
    });
    assert.deepEqual(tasks.listTasks("done"), [JSON.parse(completed.stdout)]);
  });

  it("recusa concluir uma tarefa done sem alterar o store", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    run(["create", "--title", "pronta"], tasks);
    run(["complete", "--id", "1"], tasks);
    const before = tasks.listTasks("all");

    const again = run(["complete", "--id", "1"], tasks);

    assert.equal(again.code, 1);
    assert.equal(again.stdout, "");
    assert.deepEqual(JSON.parse(again.stderr), {
      error: "task_already_done",
      message: "Tarefa já concluída: 1",
    });
    assert.deepEqual(tasks.listTasks("all"), before);
  });

  it("recusa concluir um id inexistente", () => {
    const result = run(["complete", "--id", "99"]);

    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.deepEqual(JSON.parse(result.stderr), {
      error: "task_not_found",
      message: "Tarefa não encontrada: 99",
    });
  });

  it("remove uma tarefa", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    run(["create", "--title", "descartar"], tasks);

    const removed = run(["remove", "--id", "1"], tasks);

    assert.equal(removed.code, 0);
    assert.equal(removed.stderr, "");
    assert.deepEqual(JSON.parse(removed.stdout), { id: "1", removed: true });
    assert.deepEqual(tasks.listTasks("all"), []);
  });

  it("recusa remover um id inexistente", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    run(["create", "--title", "fica"], tasks);
    const before = tasks.listTasks("all");

    const missing = run(["remove", "--id", "99"], tasks);

    assert.equal(missing.code, 1);
    assert.equal(missing.stdout, "");
    assert.equal(JSON.parse(missing.stderr).error, "task_not_found");
    assert.deepEqual(tasks.listTasks("all"), before);
  });

  it("rejeita id vazio ao concluir e ao remover", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    run(["create", "--title", "fica"], tasks);
    const before = tasks.listTasks("all");

    const complete = run(["complete", "--id", "   "], tasks);
    const remove = run(["remove", "--id", "   "], tasks);

    assert.equal(complete.code, 1);
    assert.equal(complete.stdout, "");
    assert.equal(JSON.parse(complete.stderr).error, "validation_error");
    assert.equal(remove.code, 1);
    assert.equal(remove.stdout, "");
    assert.equal(JSON.parse(remove.stderr).error, "validation_error");
    assert.deepEqual(tasks.listTasks("all"), before);
  });

  it("rejeita comando desconhecido", () => {
    const result = run(["explodir"]);

    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.equal(JSON.parse(result.stderr).error, "usage_error");
    assert.deepEqual(result.tasks.listTasks("all"), []);
  });

  it("pede a flag obrigatória de concluir e remover", () => {
    const tasks = new TaskService(new MemoryTaskStore());
    run(["create", "--title", "fica"], tasks);
    const before = tasks.listTasks("all");

    const complete = run(["complete"], tasks);
    const remove = run(["remove"], tasks);

    assert.equal(complete.code, 2);
    assert.equal(JSON.parse(complete.stderr).error, "usage_error");
    assert.equal(remove.code, 2);
    assert.equal(JSON.parse(remove.stderr).error, "usage_error");
    assert.equal(complete.stdout, "");
    assert.equal(remove.stdout, "");
    assert.deepEqual(tasks.listTasks("all"), before);
  });
});
