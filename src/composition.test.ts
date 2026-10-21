import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";

import { runCli, type CliIo } from "./cli.js";
import { createHttpServer } from "./http/server.js";
import { TaskService } from "./service/task-service.js";
import { MemoryTaskStore } from "./store/memory-task-store.js";

type CliResult = {
  code: number;
  stdout: string;
  stderr: string;
};

async function withBorders(
  run: (base: string, cli: (argv: string[]) => CliResult) => Promise<void>,
): Promise<void> {
  const tasks = new TaskService(new MemoryTaskStore());
  const server = createHttpServer(tasks);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run(`http://127.0.0.1:${portOf(server)}`, (argv) => cli(argv, tasks));
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

function cli(argv: string[], tasks: TaskService): CliResult {
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
  return { code: runCli(argv, tasks, io), stdout, stderr };
}

async function postTask(base: string, title: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${base}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return { status: response.status, body: await response.json() };
}

function errorCode(body: unknown): string {
  assert.ok(body !== null && typeof body === "object" && "error" in body);
  const error = body.error;
  assert.equal(typeof error, "string");
  return String(error);
}

async function listTasks(base: string): Promise<unknown> {
  const response = await fetch(`${base}/tasks`);
  assert.equal(response.status, 200);
  return response.json();
}

describe("composição das duas bordas", () => {
  it("cria pela HTTP e lista pela CLI", async () => {
    await withBorders(async (base, run) => {
      const created = await postTask(base, "via http");
      assert.equal(created.status, 201);

      const listed = run(["list"]);
      assert.equal(listed.code, 0);
      assert.deepEqual(JSON.parse(listed.stdout), { tasks: [created.body] });
    });
  });

  it("cria pela CLI e lista pela HTTP", async () => {
    await withBorders(async (base, run) => {
      const created = run(["create", "--title", "via cli"]);
      assert.equal(created.code, 0);

      assert.deepEqual(await listTasks(base), { tasks: [JSON.parse(created.stdout)] });
    });
  });

  it("uma operação inválida em uma borda não muda o que a outra lê", async () => {
    await withBorders(async (base, run) => {
      const created = await postTask(base, "compartilhada");
      assert.equal(created.status, 201);

      const beforeCli = run(["list"]);
      const invalidHttp = await postTask(base, "   ");
      assert.equal(invalidHttp.status, 400);
      assert.equal(errorCode(invalidHttp.body), "validation_error");
      const afterCli = run(["list"]);
      assert.deepEqual(afterCli.stdout, beforeCli.stdout);

      const beforeHttp = await listTasks(base);
      const invalidCli = run(["create", "--title", "   "]);
      assert.equal(invalidCli.code, 1);
      assert.equal(JSON.parse(invalidCli.stderr).error, "validation_error");
      assert.deepEqual(await listTasks(base), beforeHttp);
    });
  });
});
