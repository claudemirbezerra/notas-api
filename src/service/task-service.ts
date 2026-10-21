import { TaskAlreadyDoneError, TaskNotFoundError } from "../domain/errors.js";
import type { Task } from "../domain/task.js";
import type { TaskStore } from "../store/task-store.js";

export type TaskListFilter = "all" | "open" | "done";

export function filterTasks(tasks: readonly Task[], filter: TaskListFilter): Task[] {
  if (filter === "all") {
    return [...tasks];
  }
  return tasks.filter((task) => task.status === filter);
}

export class TaskService {
  constructor(private readonly store: TaskStore) {}

  createTask(title: string): Task {
    const task: Task = {
      id: this.store.allocateId(),
      title,
      status: "open",
    };
    this.store.insert(task);
    return task;
  }

  listTasks(filter: TaskListFilter): Task[] {
    return filterTasks(this.store.list(), filter);
  }

  completeTask(id: string): Task {
    const current = this.store.findById(id);
    if (current === undefined) {
      throw new TaskNotFoundError(id);
    }
    if (current.status === "done") {
      throw new TaskAlreadyDoneError(id);
    }
    const completed: Task = { ...current, status: "done" };
    this.store.update(completed);
    return completed;
  }

  removeTask(id: string): void {
    const current = this.store.findById(id);
    if (current === undefined) {
      throw new TaskNotFoundError(id);
    }
    this.store.delete(id);
  }
}
