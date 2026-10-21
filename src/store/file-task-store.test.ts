import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { InvalidTaskMemoryError, TaskMemoryIoError } from "../domain/errors.js";
import { FileTaskStore, type TaskFileSystem } from "./file-task-store.js";

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
    const files: TaskFileSystem = {
      read() {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
      writeFile() {
        throw new Error("não deve gravar");
      },
      rename() {
        throw new Error("não deve renomear");
      },
      remove() {
        throw new Error("não deve remover");
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
});

describe("FileTaskStore gravar", () => {
  it("cria o arquivo no insert e a abertura seguinte vê a tarefa", (t) => {
    const dir = workspace(t);
    const file = path.join(dir, "tasks.json");
    const store = FileTaskStore.open(file);
    store.insert({ id: store.allocateId(), title: "comprar leite", status: "open" });

    assert.deepEqual(
      readFileSync(file),
      Buffer.from('[{"id":"1","title":"comprar leite","status":"open"}]\n'),
    );
    assert.deepEqual(readdirSync(dir), ["tasks.json"]);
    assert.deepEqual(FileTaskStore.open(file).list(), [
      { id: "1", title: "comprar leite", status: "open" },
    ]);
  });

  it("atualiza na mesma posição e remove o item gravando o conjunto", (t) => {
    const file = fileIn(
      t,
      '[{"id":"1","title":"mais antiga","status":"open"},{"id":"2","title":"do meio","status":"open"},{"id":"3","title":"mais nova","status":"done"}]\n',
    );
    const store = FileTaskStore.open(file);
    store.update({ id: "2", title: "do meio", status: "done" });
    store.delete("1");

    const expected = [
      { id: "2", title: "do meio", status: "done" },
      { id: "3", title: "mais nova", status: "done" },
    ];
    assert.deepEqual(store.list(), expected);
    assert.deepEqual(
      readFileSync(file),
      Buffer.from(`${JSON.stringify(expected)}\n`),
    );
    assert.deepEqual(FileTaskStore.open(file).list(), expected);
  });

  it("remover a última tarefa grava uma lista vazia e não apaga o arquivo", (t) => {
    const file = fileIn(t, '[{"id":"1","title":"única","status":"open"}]\n');
    const store = FileTaskStore.open(file);
    store.delete("1");

    assert.deepEqual(store.list(), []);
    assert.equal(existsSync(file), true);
    assert.deepEqual(readFileSync(file), Buffer.from("[]\n"));
  });

  it("não grava update nem delete de id ausente", (t) => {
    const contents = Buffer.from('[{ "id" : "1", "title" : "antiga", "status" : "open" }]');
    const file = fileIn(t, contents);
    const store = FileTaskStore.open(file);

    store.update({ id: "9", title: "outra", status: "done" });
    store.delete("9");

    assert.deepEqual(readFileSync(file), contents);
    assert.deepEqual(store.list(), [{ id: "1", title: "antiga", status: "open" }]);
  });

  it("falha de gravação não muda a lista, o destino nem deixa temporário", (t) => {
    const dir = workspace(t);
    const file = path.join(dir, "tasks.json");
    const contents = Buffer.from('[{"id":"1","title":"antiga","status":"open"}]');
    writeFileSync(file, contents);
    const files: TaskFileSystem = {
      read(filePath) {
        return readFileSync(filePath);
      },
      writeFile(filePath, data) {
        writeFileSync(filePath, data);
      },
      rename() {
        throw new Error("rename failed");
      },
      remove(filePath) {
        unlinkSync(filePath);
      },
    };
    const store = FileTaskStore.open(file, files);
    const before = store.list();

    assert.throws(
      () => store.update({ id: "1", title: "antiga", status: "done" }),
      (error: unknown) => {
        assert.ok(error instanceof TaskMemoryIoError);
        assert.equal(error.message, "Não foi possível gravar tasks.json");
        return true;
      },
    );
    assert.deepEqual(store.list(), before);
    assert.deepEqual(readFileSync(file), contents);
    assert.deepEqual(
      readdirSync(dir).filter((name) => name.endsWith(".tmp")),
      [],
    );
  });

  it("falha antes de criar o arquivo deixa o destino ausente", (t) => {
    const dir = workspace(t);
    const file = path.join(dir, "tasks.json");
    const files: TaskFileSystem = {
      read() {
        return null;
      },
      writeFile() {
        throw new Error("full");
      },
      rename() {
        throw new Error("não deve renomear");
      },
      remove() {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    };
    const store = FileTaskStore.open(file, files);

    assert.throws(() => store.insert({ id: "1", title: "nova", status: "open" }), TaskMemoryIoError);
    assert.deepEqual(store.list(), []);
    assert.equal(existsSync(file), false);
    assert.deepEqual(readdirSync(dir), []);
  });

  it("reaproveita o id removido só numa abertura nova", (t) => {
    const file = fileIn(t);
    const store = FileTaskStore.open(file);
    store.insert({ id: store.allocateId(), title: "primeira", status: "open" });
    store.insert({ id: store.allocateId(), title: "segunda", status: "open" });
    store.delete("2");

    assert.equal(store.allocateId(), "3");
    assert.equal(FileTaskStore.open(file).allocateId(), "2");
  });
});
