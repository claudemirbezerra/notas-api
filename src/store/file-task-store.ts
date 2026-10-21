import { randomBytes } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { InvalidTaskMemoryError, TaskMemoryIoError } from "../domain/errors.js";
import { taskMemorySchema, type Task } from "../domain/task.js";
import type { TaskStore } from "./task-store.js";

export interface TaskFileSystem {
  read(filePath: string): Buffer | null;
  writeFile(filePath: string, contents: Buffer): void;
  rename(fromPath: string, toPath: string): void;
  remove(filePath: string): void;
}

const nodeTaskFiles: TaskFileSystem = {
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
  writeFile(filePath, contents) {
    writeFileSync(filePath, contents);
  },
  rename(fromPath, toPath) {
    renameSync(fromPath, toPath);
  },
  remove(filePath) {
    unlinkSync(filePath);
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

function persistAtomically(files: TaskFileSystem, filePath: string, tasks: readonly Task[]): void {
  const contents = Buffer.from(`${JSON.stringify(tasks.map(copyTask))}\n`, "utf8");
  const tempPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    files.writeFile(tempPath, contents);
    files.rename(tempPath, filePath);
  } catch {
    try {
      files.remove(tempPath);
    } catch {
      // O temporário pode nem ter sido criado. A falha relatada é a da gravação.
    }
    throw new TaskMemoryIoError("write");
  }
}

export class FileTaskStore implements TaskStore {
  private readonly tasks: Task[];
  private nextId: bigint;

  private constructor(
    tasks: readonly Task[],
    private readonly filePath: string,
    private readonly files: TaskFileSystem,
  ) {
    this.tasks = tasks.map(copyTask);
    this.nextId = initialNextId(tasks);
  }

  static open(filePath: string, files: TaskFileSystem = nodeTaskFiles): FileTaskStore {
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
      return new FileTaskStore([], filePath, files);
    }
    return new FileTaskStore(decodeTaskMemory(bytes), filePath, files);
  }

  private commit(next: readonly Task[]): void {
    const tasks = next.map(copyTask);
    persistAtomically(this.files, this.filePath, tasks);
    this.tasks.splice(0, this.tasks.length, ...tasks);
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
    this.commit([...this.tasks, copyTask(task)]);
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
    const next = this.tasks.map(copyTask);
    next[index] = copyTask(task);
    this.commit(next);
  }

  delete(id: string): void {
    const index = this.tasks.findIndex((item) => item.id === id);
    if (index === -1) {
      return;
    }
    this.commit(this.tasks.filter((item) => item.id !== id));
  }
}
