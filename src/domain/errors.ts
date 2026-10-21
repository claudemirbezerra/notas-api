export abstract class AppError extends Error {
  abstract readonly code: string;
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
