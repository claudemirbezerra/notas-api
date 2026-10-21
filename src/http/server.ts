import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { createTaskSchema, taskFilterSchema } from "../domain/task.js";
import type { TaskService } from "../service/task-service.js";
import { RouteNotFoundError, parseJsonBody, toHttpError } from "./errors.js";

export function createHttpServer(service: TaskService): Server {
  return createServer((request, response) => {
    void handle(request, response, service).catch((error: unknown) => {
      if (!response.headersSent) {
        const translated = toHttpError(error);
        sendJson(response, translated.status, translated.body);
      }
    });
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  service: TaskService,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "POST" && url.pathname === "/tasks") {
    await handleCreate(request, response, service);
    return;
  }

  if (request.method === "GET" && url.pathname === "/tasks") {
    handleList(url, response, service);
    return;
  }

  throw new RouteNotFoundError();
}

async function handleCreate(
  request: IncomingMessage,
  response: ServerResponse,
  service: TaskService,
): Promise<void> {
  const body = parseJsonBody(await readBody(request));
  const parsed = createTaskSchema.parse(body);
  sendJson(response, 201, service.createTask(parsed.title));
}

function handleList(url: URL, response: ServerResponse, service: TaskService): void {
  const rawStatus = url.searchParams.get("status");
  const filter = rawStatus === null ? "all" : taskFilterSchema.parse(rawStatus);
  sendJson(response, 200, { tasks: service.listTasks(filter) });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}
