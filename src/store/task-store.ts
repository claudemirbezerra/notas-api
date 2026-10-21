import type { Task } from "../domain/task.js";

export interface TaskStore {
  allocateId(): string;
  insert(task: Task): void;
  list(): Task[];
  findById(id: string): Task | undefined;
  update(task: Task): void;
  delete(id: string): void;
}
