import { z } from "zod";

export const taskStatuses = ["open", "done"] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export type Task = {
  id: string;
  title: string;
  status: TaskStatus;
};

export const createTaskSchema = z.object({
  title: z.string().trim().min(1),
});

export const taskFilterSchema = z.enum(["all", "open", "done"]);

export const taskIdSchema = z.string().trim().min(1);

export class TaskNotFoundError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`Tarefa não encontrada: ${id}`);
    this.name = "TaskNotFoundError";
    this.id = id;
  }
}

export class TaskAlreadyDoneError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`Tarefa já concluída: ${id}`);
    this.name = "TaskAlreadyDoneError";
    this.id = id;
  }
}
