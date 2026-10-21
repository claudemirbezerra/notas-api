import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runCli, runPersistentCli, type CliIo } from "./cli.js";
import { TaskService } from "./service/task-service.js";
import type { TaskFileSystem } from "./store/file-task-store.js";
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

type TestContext = {
  after(fn: () => void): void;
};

function memoryFile(t: TestContext, contents?: Buffer | string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "notas-cli-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const file = path.join(dir, "tasks.json");
  if (contents !== undefined) {
    writeFileSync(file, contents);
  }
  return file;
}

function runPersistent(argv: string[], filePath: string, files?: TaskFileSystem) {
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
  const code = runPersistentCli(argv, filePath, io, files);
  return { code, stdout, stderr };
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

describe("CLI memória entre invocações", () => {
  it("cria e a listagem seguinte devolve o mesmo id, título e open", (t) => {
    const file = memoryFile(t);
    const created = runPersistent(["create", "--title", "  comprar leite  "], file);

    assert.equal(created.code, 0);
    assert.equal(created.stderr, "");
    assert.deepEqual(JSON.parse(created.stdout), {
      id: "1",
      title: "comprar leite",
      status: "open",
    });

    const listed = runPersistent(["list"], file);
    assert.equal(listed.code, 0);
    assert.deepEqual(JSON.parse(listed.stdout), {
      tasks: [{ id: "1", title: "comprar leite", status: "open" }],
    });
  });

  it("duas criações aparecem na ordem, com ids diferentes", (t) => {
    const file = memoryFile(t);
    const older = runPersistent(["create", "--title", "mais antiga"], file);
    const newer = runPersistent(["create", "--title", "mais nova"], file);

    assert.equal(older.code, 0);
    assert.equal(newer.code, 0);
    assert.notEqual(JSON.parse(older.stdout).id, JSON.parse(newer.stdout).id);

    const listed = runPersistent(["list"], file);
    assert.deepEqual(JSON.parse(listed.stdout), {
      tasks: [
        { id: "1", title: "mais antiga", status: "open" },
        { id: "2", title: "mais nova", status: "open" },
      ],
    });
  });

  it("concluir e remover aparecem na invocação seguinte, sem trocar a posição", (t) => {
    const file = memoryFile(t);
    runPersistent(["create", "--title", "mais antiga"], file);
    runPersistent(["create", "--title", "do meio"], file);
    runPersistent(["create", "--title", "mais nova"], file);

    const completed = runPersistent(["complete", "--id", "2"], file);
    assert.equal(completed.code, 0);
    assert.deepEqual(JSON.parse(completed.stdout), {
      id: "2",
      title: "do meio",
      status: "done",
    });

    const afterComplete = runPersistent(["list"], file);
    assert.deepEqual(JSON.parse(afterComplete.stdout), {
      tasks: [
        { id: "1", title: "mais antiga", status: "open" },
        { id: "2", title: "do meio", status: "done" },
        { id: "3", title: "mais nova", status: "open" },
      ],
    });

    const removed = runPersistent(["remove", "--id", "1"], file);
    assert.equal(removed.code, 0);

    const afterRemove = runPersistent(["list"], file);
    assert.deepEqual(JSON.parse(afterRemove.stdout), {
      tasks: [
        { id: "2", title: "do meio", status: "done" },
        { id: "3", title: "mais nova", status: "open" },
      ],
    });
  });

  it("listar sem arquivo não cria tasks.json", (t) => {
    const file = memoryFile(t);
    const listed = runPersistent(["list"], file);

    assert.equal(listed.code, 0);
    assert.equal(listed.stderr, "");
    assert.deepEqual(JSON.parse(listed.stdout), { tasks: [] });
    assert.equal(existsSync(file), false);
  });

  it("criar a partir de arquivo ausente ou em branco grava a tarefa", (t) => {
    const absent = memoryFile(t);
    const created = runPersistent(["create", "--title", "primeira"], absent);
    assert.equal(created.code, 0);
    assert.equal(existsSync(absent), true);
    assert.deepEqual(JSON.parse(runPersistent(["list"], absent).stdout), {
      tasks: [{ id: "1", title: "primeira", status: "open" }],
    });

    const blank = memoryFile(t, " \n\t ");
    const fromBlank = runPersistent(["create", "--title", "segunda"], blank);
    assert.equal(fromBlank.code, 0);
    assert.deepEqual(JSON.parse(runPersistent(["list"], blank).stdout), {
      tasks: [{ id: "1", title: "segunda", status: "open" }],
    });
  });

  it("listar uma lista vazia não muda os bytes", (t) => {
    const contents = Buffer.from("[]");
    const file = memoryFile(t, contents);
    const listed = runPersistent(["list"], file);

    assert.equal(listed.code, 0);
    assert.deepEqual(JSON.parse(listed.stdout), { tasks: [] });
    assert.deepEqual(readFileSync(file), contents);
  });

  it("diretórios diferentes não compartilham tarefas", (t) => {
    const first = memoryFile(t);
    const second = memoryFile(t);
    runPersistent(["create", "--title", "somente a"], first);
    runPersistent(["create", "--title", "somente b"], second);

    assert.deepEqual(JSON.parse(runPersistent(["list"], first).stdout), {
      tasks: [{ id: "1", title: "somente a", status: "open" }],
    });
    assert.deepEqual(JSON.parse(runPersistent(["list"], second).stdout), {
      tasks: [{ id: "1", title: "somente b", status: "open" }],
    });
  });
});

describe("CLI arquivo inválido e falha sem gravar", () => {
  it("conteúdo inválido falha no comando conhecido e no desconhecido sem alterar os bytes", (t) => {
    const contents = Buffer.from("{");
    const file = memoryFile(t, contents);

    const listed = runPersistent(["list"], file);
    assert.equal(listed.code, 1);
    assert.equal(listed.stdout, "");
    assert.equal(JSON.parse(listed.stderr).error, "invalid_task_memory");
    assert.deepEqual(readFileSync(file), contents);

    const unknown = runPersistent(["explodir"], file);
    assert.equal(unknown.code, 1);
    assert.equal(unknown.stdout, "");
    assert.equal(JSON.parse(unknown.stderr).error, "invalid_task_memory");
    assert.deepEqual(readFileSync(file), contents);
  });

  it("uso incorreto sem arquivo ou com arquivo em branco não cria nem reescreve", (t) => {
    const absent = memoryFile(t);
    const unknown = runPersistent(["explodir"], absent);
    const missingFlag = runPersistent(["create"], absent);

    assert.equal(unknown.code, 2);
    assert.equal(JSON.parse(unknown.stderr).error, "usage_error");
    assert.equal(missingFlag.code, 2);
    assert.equal(JSON.parse(missingFlag.stderr).error, "usage_error");
    assert.equal(existsSync(absent), false);

    const blank = Buffer.from(" \n\t ");
    const blankFile = memoryFile(t, blank);
    const blankUsage = runPersistent(["remove"], blankFile);
    assert.equal(blankUsage.code, 2);
    assert.equal(JSON.parse(blankUsage.stderr).error, "usage_error");
    assert.deepEqual(readFileSync(blankFile), blank);
  });

  it("uso incorreto com arquivo válido não muda os bytes", (t) => {
    const contents = Buffer.from('[{"id":"1","title":"fica","status":"open"}]');
    const file = memoryFile(t, contents);

    const unknown = runPersistent(["explodir"], file);
    const missingFlag = runPersistent(["complete"], file);

    assert.equal(unknown.code, 2);
    assert.equal(JSON.parse(unknown.stderr).error, "usage_error");
    assert.equal(missingFlag.code, 2);
    assert.equal(JSON.parse(missingFlag.stderr).error, "usage_error");
    assert.equal(unknown.stdout, "");
    assert.equal(missingFlag.stdout, "");
    assert.deepEqual(readFileSync(file), contents);
  });

  it("rejeições da spec 001 não mudam os bytes", (t) => {
    const contents = Buffer.from('[{"id":"1","title":"feita","status":"done"}]\n');
    const file = memoryFile(t, contents);

    const title = runPersistent(["create", "--title", "   "], file);
    const filter = runPersistent(["list", "--status", "later"], file);
    const missing = runPersistent(["complete", "--id", "9"], file);
    const alreadyDone = runPersistent(["complete", "--id", "1"], file);

    assert.equal(title.code, 1);
    assert.equal(JSON.parse(title.stderr).error, "validation_error");
    assert.equal(filter.code, 1);
    assert.equal(JSON.parse(filter.stderr).error, "validation_error");
    assert.equal(missing.code, 1);
    assert.equal(JSON.parse(missing.stderr).error, "task_not_found");
    assert.equal(alreadyDone.code, 1);
    assert.equal(JSON.parse(alreadyDone.stderr).error, "task_already_done");
    assert.equal(title.stdout, "");
    assert.equal(filter.stdout, "");
    assert.equal(missing.stdout, "");
    assert.equal(alreadyDone.stdout, "");
    assert.deepEqual(readFileSync(file), contents);
  });

  it("falha de gravação injetada não deixa a tarefa no arquivo", (t) => {
    const files: TaskFileSystem = {
      read() {
        return null;
      },
      writeFile() {
        throw new Error("full");
      },
      rename() {
        throw new Error("não deve renomear");
      },
      remove() {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    };
    const absent = memoryFile(t);
    const created = runPersistent(["create", "--title", "nova"], absent, files);

    assert.equal(created.code, 1);
    assert.equal(created.stdout, "");
    assert.equal(JSON.parse(created.stderr).error, "task_memory_io");
    assert.equal(existsSync(absent), false);

    const contents = Buffer.from('[{"id":"1","title":"antiga","status":"open"}]\n');
    const existing = memoryFile(t, contents);
    const failed = runPersistent(["create", "--title", "outra"], existing, {
      read() {
        return Buffer.from(contents);
      },
      writeFile() {
        throw new Error("full");
      },
      rename() {
        throw new Error("não deve renomear");
      },
      remove() {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    });

    assert.equal(failed.code, 1);
    assert.equal(JSON.parse(failed.stderr).error, "task_memory_io");
    assert.deepEqual(readFileSync(existing), contents);
    assert.deepEqual(JSON.parse(runPersistent(["list"], existing).stdout), {
      tasks: [{ id: "1", title: "antiga", status: "open" }],
    });
  });
});
