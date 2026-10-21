import type { Task } from "../domain/task.js";
import type { TaskStore } from "./task-store.js";

function copyTask(task: Task): Task {
  return { id: task.id, title: task.title, status: task.status };
}

export class MemoryTaskStore implements TaskStore {
  private readonly tasks: Task[] = [];
  private nextId = 1;

  allocateId(): string {
    const id = String(this.nextId);
    this.nextId += 1;
    return id;
  }

  insert(task: Task): void {
    this.tasks.push(copyTask(task));
  }

  list(): Task[] {
    return this.tasks.map(copyTask);
  }

  findById(id: string): Task | undefined {
    const task = this.tasks.find((item) => item.id === id);
    return task === undefined ? undefined : copyTask(task);
  }

  update(task: Task): void {
    const index = this.tasks.findIndex((item) => item.id === task.id);
    if (index === -1) {
      return;
    }
    this.tasks[index] = copyTask(task);
  }

  delete(id: string): void {
    const index = this.tasks.findIndex((item) => item.id === id);
    if (index === -1) {
      return;
    }
    this.tasks.splice(index, 1);
  }
}
