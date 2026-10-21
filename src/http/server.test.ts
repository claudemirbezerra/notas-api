import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";

import { MemoryTaskStore } from "../store/memory-task-store.js";
import { TaskService } from "../service/task-service.js";
import { createHttpServer } from "./server.js";

type JsonResponse = {
  status: number;
  body: unknown;
};

async function withServer(
  run: (base: string, tasks: TaskService) => Promise<void>,
): Promise<void> {
  const tasks = new TaskService(new MemoryTaskStore());
  const server = createHttpServer(tasks);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${portOf(server)}`, tasks);
  } finally {
    await closeServer(server);
  }
}

function portOf(server: Server): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("porta indisponível");
  }
  return (address as AddressInfo).port;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function request(base: string, path: string, init?: RequestInit): Promise<JsonResponse> {
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  return { status: response.status, body: text.length === 0 ? undefined : JSON.parse(text) };
}

function postTask(base: string, body: unknown): Promise<JsonResponse> {
  return request(base, "/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("HTTP criar e listar", () => {
  it("cria uma tarefa com 201 e o título sem espaços nas pontas", async () => {
    await withServer(async (base) => {
      const created = await postTask(base, { title: "  comprar leite  " });
      assert.equal(created.status, 201);
      assert.deepEqual(created.body, {
        id: "1",
        title: "comprar leite",
        status: "open",
      });

      const listed = await request(base, "/tasks");
      assert.equal(listed.status, 200);
      assert.deepEqual(listed.body, { tasks: [created.body] });
    });
  });

  it("rejeita título inválido sem criar", async () => {
    await withServer(async (base, tasks) => {
      const created = await postTask(base, { title: "existente" });
      assert.equal(created.status, 201);
      const before = tasks.listTasks("all");

      const invalid = await postTask(base, { title: "   " });
      assert.equal(invalid.status, 400);
      assert.equal(errorBody(invalid.body).error, "validation_error");
      assert.ok(errorBody(invalid.body).message.length > 0);
      assert.deepEqual(tasks.listTasks("all"), before);

      const listed = await request(base, "/tasks");
      assert.deepEqual(listed.body, { tasks: before });
    });
  });

  it("lista sem filtro, all, open e done na ordem de criação", async () => {
    await withServer(async (base, tasks) => {
      const older = tasks.createTask("mais antiga");
      const middle = tasks.createTask("do meio");
      tasks.completeTask(middle.id);
      const newer = tasks.createTask("mais nova");

      const withoutFilter = await request(base, "/tasks");
      const withAll = await request(base, "/tasks?status=all");
      const open = await request(base, "/tasks?status=open");
      const done = await request(base, "/tasks?status=done");

      assert.equal(withoutFilter.status, 200);
      assert.equal(withAll.status, 200);
      assert.deepEqual(withoutFilter.body, { tasks: tasks.listTasks("all") });
      assert.deepEqual(withAll.body, { tasks: tasks.listTasks("all") });
      assert.deepEqual(open.body, {
        tasks: [
          { id: older.id, title: "mais antiga", status: "open" },
          { id: newer.id, title: "mais nova", status: "open" },
        ],
      });
      assert.deepEqual(done.body, {
        tasks: [{ id: middle.id, title: "do meio", status: "done" }],
      });
    });
  });

  it("rejeita filtro inválido sem alterar a lista", async () => {
    await withServer(async (base, tasks) => {
      tasks.createTask("aberta");
      const done = tasks.createTask("fechada");
      tasks.completeTask(done.id);
      const before = tasks.listTasks("all");

      const invalid = await request(base, "/tasks?status=later");
      assert.equal(invalid.status, 400);
      assert.equal(errorBody(invalid.body).error, "validation_error");
      assert.deepEqual(tasks.listTasks("all"), before);

      const listed = await request(base, "/tasks");
      assert.deepEqual(listed.body, { tasks: before });
    });
  });
});

describe("HTTP concluir, remover e rota desconhecida", () => {
  it("conclui uma tarefa open", async () => {
    await withServer(async (base) => {
      const created = await postTask(base, { title: "comprar leite" });

      const completed = await request(base, "/tasks/1/complete", { method: "POST" });
      assert.equal(completed.status, 200);
      assert.deepEqual(completed.body, {
        id: "1",
        title: "comprar leite",
        status: "done",
      });

      const listed = await request(base, "/tasks?status=done");
      assert.deepEqual(listed.body, { tasks: [completed.body] });
      assert.deepEqual(created.body, {
        id: "1",
        title: "comprar leite",
        status: "open",
      });
    });
  });

  it("recusa concluir uma tarefa done sem alterar a lista", async () => {
    await withServer(async (base, tasks) => {
      await postTask(base, { title: "pronta" });
      await request(base, "/tasks/1/complete", { method: "POST" });
      const before = tasks.listTasks("all");

      const again = await request(base, "/tasks/1/complete", { method: "POST" });
      assert.equal(again.status, 409);
      assert.deepEqual(again.body, {
        error: "task_already_done",
        message: "Tarefa já concluída: 1",
      });
      assert.deepEqual(tasks.listTasks("all"), before);
    });
  });

  it("recusa concluir um id inexistente", async () => {
    await withServer(async (base, tasks) => {
      const missing = await request(base, "/tasks/99/complete", { method: "POST" });
      assert.equal(missing.status, 404);
      assert.deepEqual(missing.body, {
        error: "task_not_found",
        message: "Tarefa não encontrada: 99",
      });
      assert.deepEqual(tasks.listTasks("all"), []);
    });
  });

  it("remove uma tarefa com 204 e sem corpo", async () => {
    await withServer(async (base) => {
      await postTask(base, { title: "descartar" });

      const removed = await request(base, "/tasks/1", { method: "DELETE" });
      assert.equal(removed.status, 204);
      assert.equal(removed.body, undefined);

      const listed = await request(base, "/tasks");
      assert.deepEqual(listed.body, { tasks: [] });
    });
  });

  it("recusa remover um id inexistente", async () => {
    await withServer(async (base, tasks) => {
      await postTask(base, { title: "fica" });
      const before = tasks.listTasks("all");

      const missing = await request(base, "/tasks/99", { method: "DELETE" });
      assert.equal(missing.status, 404);
      assert.equal(errorBody(missing.body).error, "task_not_found");
      assert.deepEqual(tasks.listTasks("all"), before);
    });
  });

  it("rejeita id vazio ao concluir e ao remover", async () => {
    await withServer(async (base, tasks) => {
      await postTask(base, { title: "fica" });
      const before = tasks.listTasks("all");
      const blank = encodeURIComponent("   ");

      const complete = await request(base, `/tasks/${blank}/complete`, { method: "POST" });
      const remove = await request(base, `/tasks/${blank}`, { method: "DELETE" });

      assert.equal(complete.status, 400);
      assert.equal(errorBody(complete.body).error, "validation_error");
      assert.equal(remove.status, 400);
      assert.equal(errorBody(remove.body).error, "validation_error");
      assert.deepEqual(tasks.listTasks("all"), before);
    });
  });

  it("rejeita JSON inválido sem alterar o store", async () => {
    await withServer(async (base, tasks) => {
      await postTask(base, { title: "existente" });
      const before = tasks.listTasks("all");

      const invalid = await request(base, "/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });

      assert.equal(invalid.status, 400);
      assert.deepEqual(invalid.body, {
        error: "validation_error",
        message: "JSON inválido",
      });
      assert.deepEqual(tasks.listTasks("all"), before);
    });
  });

  it("responde rota ou método desconhecido com route_not_found", async () => {
    await withServer(async (base) => {
      const missing = await request(base, "/ausente");
      const wrongMethod = await request(base, "/tasks", { method: "PUT" });

      assert.equal(missing.status, 404);
      assert.deepEqual(missing.body, {
        error: "route_not_found",
        message: "Rota não encontrada",
      });
      assert.equal(wrongMethod.status, 404);
      assert.equal(errorBody(wrongMethod.body).error, "route_not_found");
    });
  });
});

function errorBody(body: unknown): { error: string; message: string } {
  assert.ok(body !== null && typeof body === "object");
  const record = body as { error?: unknown; message?: unknown };
  assert.equal(typeof record.error, "string");
  assert.equal(typeof record.message, "string");
  return { error: String(record.error), message: String(record.message) };
}
