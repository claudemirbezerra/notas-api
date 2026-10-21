import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { InvalidTaskMemoryError, TaskMemoryIoError } from "../domain/errors.js";
import { FileTaskStore, type TaskFileReader } from "./file-task-store.js";

type TestContext = {
  after(fn: () => void): void;
};

function workspace(t: TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), "notas-memory-"));
  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

function fileIn(t: TestContext, contents?: Buffer | string): string {
  const file = path.join(workspace(t), "tasks.json");
  if (contents !== undefined) {
    writeFileSync(file, contents);
  }
  return file;
}

function expectInvalid(t: TestContext, contents: Buffer | string): void {
  const file = fileIn(t, contents);
  const before = readFileSync(file);
  assert.throws(() => FileTaskStore.open(file), InvalidTaskMemoryError);
  assert.deepEqual(readFileSync(file), before);
}

describe("FileTaskStore abrir", () => {
  it("abre arquivo ausente como lista vazia e não cria o arquivo", (t) => {
    const file = fileIn(t);
    const store = FileTaskStore.open(file);

    assert.deepEqual(store.list(), []);
    assert.equal(store.allocateId(), "1");
    assert.equal(existsSync(file), false);
  });

  it("abre arquivo vazio ou só com espaços sem reescrever", (t) => {
    const empty = fileIn(t, "");
    assert.deepEqual(FileTaskStore.open(empty).list(), []);
    assert.deepEqual(readFileSync(empty), Buffer.from(""));

    const blank = fileIn(t, " \n\t ");
    const before = readFileSync(blank);
    const store = FileTaskStore.open(blank);
    assert.deepEqual(store.list(), []);
    assert.equal(store.allocateId(), "1");
    assert.deepEqual(readFileSync(blank), before);
  });

  it("abre uma lista JSON vazia e preserva os bytes", (t) => {
    const file = fileIn(t, "[]");
    const before = readFileSync(file);
    const store = FileTaskStore.open(file);

    assert.deepEqual(store.list(), []);
    store.list();
    assert.deepEqual(readFileSync(file), before);
  });

  it("abre uma lista válida na ordem do arquivo sem reescrever", (t) => {
    const contents = Buffer.from(
      '[{"id":"1","title":"mais antiga","status":"open"},{"id":"2","title":"mais nova","status":"done"}]',
    );
    const file = fileIn(t, contents);
    const store = FileTaskStore.open(file);

    assert.deepEqual(store.list(), [
      { id: "1", title: "mais antiga", status: "open" },
      { id: "2", title: "mais nova", status: "done" },
    ]);
    store.list();
    assert.deepEqual(readFileSync(file), contents);
  });

  it("rejeita JSON ilegível, BOM, raiz inválida e falha de schema sem alterar os bytes", (t) => {
    expectInvalid(t, "{");
    expectInvalid(t, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("[]")]));
    expectInvalid(t, Buffer.from([0xff]));
    expectInvalid(t, "{}");
    expectInvalid(t, '[{"id":"1","title":"estudar","status":"open","extra":true}]');
    expectInvalid(t, '[{"id":"1","title":"","status":"open"}]');
    expectInvalid(t, '[{"id":"1","title":" comprar leite ","status":"open"}]');
    expectInvalid(t, '[{"id":"1","title":"estudar","status":"later"}]');
    expectInvalid(
      t,
      '[{"id":"1","title":"uma","status":"open"},{"id":"1","title":"outra","status":"done"}]',
    );
  });

  it("rejeita diretório no lugar do arquivo sem apagá-lo", (t) => {
    const file = path.join(workspace(t), "tasks.json");
    mkdirSync(file);

    assert.throws(() => FileTaskStore.open(file), TaskMemoryIoError);
    assert.equal(statSync(file).isDirectory(), true);
  });

  it("traduz falha de leitura do dublê para erro de IO", (t) => {
    const file = fileIn(t, "[]");
    const before = readFileSync(file);
    const files: TaskFileReader = {
      read() {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    };

    assert.throws(() => FileTaskStore.open(file, files), TaskMemoryIoError);
    assert.deepEqual(readFileSync(file), before);
  });

  it("calcula o próximo id depois do maior id decimal", (t) => {
    const file = fileIn(
      t,
      '[{"id":"2","title":"duas","status":"open"},{"id":"10","title":"dez","status":"done"}]',
    );
    const store = FileTaskStore.open(file);

    assert.equal(store.allocateId(), "11");
  });

  it("mantém id não decimal ocupado e não o devolve", (t) => {
    const file = fileIn(
      t,
      '[{"id":"abc","title":"livro","status":"open"},{"id":"01","title":"zero","status":"done"},{"id":"2","title":"duas","status":"open"}]',
    );
    const store = FileTaskStore.open(file);

    assert.deepEqual(store.findById("abc"), { id: "abc", title: "livro", status: "open" });
    assert.deepEqual(store.findById("01"), { id: "01", title: "zero", status: "done" });
    assert.equal(store.allocateId(), "3");
    assert.equal(store.allocateId(), "4");
  });

  it("mutações ainda não gravam o arquivo", (t) => {
    const contents = Buffer.from('[{"id":"1","title":"antiga","status":"open"}]');
    const file = fileIn(t, contents);
    const store = FileTaskStore.open(file);

    store.update({ id: "1", title: "antiga", status: "done" });
    store.delete("ausente");
    store.insert({ id: "4", title: "nova", status: "open" });

    assert.deepEqual(readFileSync(file), contents);
    assert.deepEqual(store.list(), [
      { id: "1", title: "antiga", status: "done" },
      { id: "4", title: "nova", status: "open" },
    ]);
  });
});
