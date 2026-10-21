import path from "node:path";
import { pathToFileURL } from "node:url";

import { AppError, toErrorBody } from "./domain/errors.js";
import { createTaskSchema, taskFilterSchema, taskIdSchema } from "./domain/task.js";
import { TaskService } from "./service/task-service.js";
import { FileTaskStore } from "./store/file-task-store.js";
import { MemoryTaskStore } from "./store/memory-task-store.js";

export type CliWriter = {
  write(chunk: string): unknown;
};

export type CliIo = {
  stdout: CliWriter;
  stderr: CliWriter;
};

const exitByCode: Record<string, number> = {
  usage_error: 2,
};

class UsageError extends AppError {
  readonly code = "usage_error";

  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export function runPersistentCli(
  argv: readonly string[],
  filePath: string,
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
): number {
  const store = FileTaskStore.open(filePath);
  return runCli(argv, new TaskService(store), io);
}

export function runCli(
  argv: readonly string[],
  service: TaskService,
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
): number {
  try {
    const result = dispatch(commandArgv(argv), service);
    io.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const body = toErrorBody(error);
    io.stderr.write(`${JSON.stringify(body)}\n`);
    return exitByCode[body.error] ?? 1;
  }
}

const commands = new Set(["create", "list", "complete", "remove"]);

function commandArgv(argv: readonly string[]): string[] {
  const start = argv.findIndex((arg) => commands.has(arg));
  return start === -1 ? [...argv] : argv.slice(start);
}

function dispatch(args: string[], service: TaskService): unknown {
  const [command, ...rest] = args;
  if (command === "create") {
    return create(rest, service);
  }
  if (command === "list") {
    return list(rest, service);
  }
  if (command === "complete") {
    return complete(rest, service);
  }
  if (command === "remove") {
    return remove(rest, service);
  }
  throw new UsageError("Comando desconhecido");
}

function create(args: string[], service: TaskService): unknown {
  const title = requiredFlag(args, "--title");
  const parsed = createTaskSchema.parse({ title });
  return service.createTask(parsed.title);
}

function complete(args: string[], service: TaskService): unknown {
  const id = taskIdSchema.parse(requiredFlag(args, "--id"));
  return service.completeTask(id);
}

function remove(args: string[], service: TaskService): unknown {
  const id = taskIdSchema.parse(requiredFlag(args, "--id"));
  service.removeTask(id);
  return { id, removed: true };
}

function list(args: string[], service: TaskService): unknown {
  const status = flag(args, "--status");
  const filter = status === undefined ? "all" : taskFilterSchema.parse(status);
  return { tasks: service.listTasks(filter) };
}

function requiredFlag(args: string[], name: string): string {
  const value = flag(args, name);
  if (value === undefined) {
    throw new UsageError(`Informe ${name}`);
  }
  return value;
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`Informe o valor de ${name}`);
  }
  return value;
}

function isCliEntrypoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
}

if (isCliEntrypoint()) {
  const code = runCli(process.argv, new TaskService(new MemoryTaskStore()));
  process.exit(code);
}
