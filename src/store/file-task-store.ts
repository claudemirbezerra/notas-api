import { readFileSync } from "node:fs";

import { InvalidTaskMemoryError, TaskMemoryIoError } from "../domain/errors.js";
import { taskMemorySchema, type Task } from "../domain/task.js";
import type { TaskStore } from "./task-store.js";

export interface TaskFileReader {
  read(filePath: string): Buffer | null;
}

const nodeTaskFileReader: TaskFileReader = {
  read(filePath) {
    try {
      return readFileSync(filePath);
    } catch (error) {
      if (isEnoent(error)) {
        return null;
      }
      throw error;
    }
  },
};

const decimalId = /^(0|[1-9][0-9]*)$/;

function copyTask(task: Task): Task {
  return { id: task.id, title: task.title, status: task.status };
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function decodeTaskMemory(bytes: Buffer): Task[] {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new InvalidTaskMemoryError();
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidTaskMemoryError();
  }
  if (text.trim() === "") {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new InvalidTaskMemoryError();
  }
  const result = taskMemorySchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidTaskMemoryError();
  }
  return result.data;
}

function initialNextId(tasks: readonly Task[]): bigint {
  let max = 0n;
  for (const task of tasks) {
    if (!decimalId.test(task.id)) {
      continue;
    }
    const value = BigInt(task.id);
    if (value > max) {
      max = value;
    }
  }
  return max + 1n;
}

export class FileTaskStore implements TaskStore {
  private readonly tasks: Task[];
  private nextId: bigint;

  private constructor(tasks: readonly Task[]) {
    this.tasks = tasks.map(copyTask);
    this.nextId = initialNextId(tasks);
  }

  static open(filePath: string, files: TaskFileReader = nodeTaskFileReader): FileTaskStore {
    let bytes: Buffer | null;
    try {
      bytes = files.read(filePath);
    } catch (error) {
      if (error instanceof TaskMemoryIoError) {
        throw error;
      }
      throw new TaskMemoryIoError("read");
    }
    if (bytes === null) {
      return new FileTaskStore([]);
    }
    return new FileTaskStore(decodeTaskMemory(bytes));
  }

  allocateId(): string {
    while (this.tasks.some((task) => task.id === this.nextId.toString())) {
      this.nextId += 1n;
    }
    const id = this.nextId.toString();
    this.nextId += 1n;
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
