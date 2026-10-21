import { ZodError } from "zod";

export type ErrorBody = {
  error: string;
  message: string;
};

export abstract class AppError extends Error {
  abstract readonly code: string;
}

export function toErrorBody(error: unknown): ErrorBody {
  if (error instanceof ZodError) {
    return {
      error: "validation_error",
      message: error.issues[0]?.message ?? "Entrada inválida",
    };
  }
  if (error instanceof AppError) {
    return { error: error.code, message: error.message };
  }
  return { error: "internal_error", message: "Erro interno" };
}

export class TaskNotFoundError extends AppError {
  readonly code = "task_not_found";
  readonly id: string;

  constructor(id: string) {
    super(`Tarefa não encontrada: ${id}`);
    this.name = "TaskNotFoundError";
    this.id = id;
  }
}

export class TaskAlreadyDoneError extends AppError {
  readonly code = "task_already_done";
  readonly id: string;

  constructor(id: string) {
    super(`Tarefa já concluída: ${id}`);
    this.name = "TaskAlreadyDoneError";
    this.id = id;
  }
}

export class InvalidTaskMemoryError extends AppError {
  readonly code = "invalid_task_memory";

  constructor() {
    super("tasks.json não contém uma lista de tarefas válida");
    this.name = "InvalidTaskMemoryError";
  }
}

export class TaskMemoryIoError extends AppError {
  readonly code = "task_memory_io";

  constructor(operation: "read" | "write") {
    super(
      operation === "read"
        ? "Não foi possível ler tasks.json"
        : "Não foi possível gravar tasks.json",
    );
    this.name = "TaskMemoryIoError";
  }
}
