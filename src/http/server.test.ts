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
  return { status: response.status, body: await response.json() };
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
      assert.equal(invalidBody(invalid.body).error, "validation_error");
      assert.ok(invalidBody(invalid.body).message.length > 0);
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
      assert.equal(invalidBody(invalid.body).error, "validation_error");
      assert.deepEqual(tasks.listTasks("all"), before);

      const listed = await request(base, "/tasks");
      assert.deepEqual(listed.body, { tasks: before });
    });
  });
});

function invalidBody(body: unknown): { error: string; message: string } {
  assert.ok(body !== null && typeof body === "object");
  const record = body as { error?: unknown; message?: unknown };
  assert.equal(typeof record.error, "string");
  assert.equal(typeof record.message, "string");
  return { error: String(record.error), message: String(record.message) };
}
