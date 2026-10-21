# Plano 001 — Gerenciamento de tarefas

Plano técnico da [spec 001](001-gerenciamento-de-tarefas-spec.md). Não há código em `src/` ainda. Este documento fixa o como; a implementação espera revisão humana.

## 1. Arquitetura

Dependências fluem só neste sentido: `http` / `cli` → `service` → `store`. O domínio não faz IO, não importa store nem borda, e não chama `parse` do Zod. O Zod fica declarado no domínio e é executado na borda, antes de qualquer chamada ao service.

Cada entrypoint compõe o próprio store em memória e o próprio service:

- `src/index.ts` sobe o HTTP em `localhost:3000`.
- `src/cli.ts` executa um comando e encerra.

Os dois processos não compartilham tarefas. O compartilhamento exigido pela spec vale quando as duas bordas recebem o mesmo `TaskService`. O teste de aceite monta esse processo único. `npm run dev` e `npm run cli`, rodados separados, começam vazios e não se enxergam.

```text
src/domain/task.ts                 tipos, schemas Zod, classes de erro
src/store/task-store.ts            interface TaskStore
src/store/memory-task-store.ts     array em memória + contador de id
src/store/memory-task-store.test.ts
src/service/task-service.ts        criar, listar, concluir, remover
src/service/task-service.test.ts
src/http/server.ts                 createHttpServer(service) com node:http
src/http/server.test.ts
src/index.ts                       composição e listen
src/cli.ts                         composição, runCli e saída do processo
src/cli.test.ts
```

O service recebe a interface `TaskStore`. Não importa `src/http` nem `src/cli`. A filtragem por estado é função pura sobre a lista já lida. A mutação fica nos métodos que chamam o store.

`createHttpServer` e `runCli` recebem o service por parâmetro. Os testes usam essas funções sem passar pelos entrypoints.

## 2. Modelo de dados

Tarefa:

- `id`: string gerada pelo store
- `title`: string já sem espaços nas extremidades
- `status`: `"open"` ou `"done"`

Não há outros campos. A ordem de criação é a posição no array do store, não um campo da tarefa. `update` substitui o item na mesma posição. `delete` remove a posição. Concluir não reordena.

Schemas Zod, definidos em `src/domain/task.ts` e aplicados só na borda:

- Criação: objeto com `title` string, `trim`, mínimo de 1 caractere. Chave ausente, string vazia ou só espaços falha. Chaves extras são descartadas.
- Filtro: enum `all` | `open` | `done`. Ausência do parâmetro vira `all` na borda, antes do parse. Valor presente e fora do enum falha. String vazia falha.
- Id de concluir e remover: string com `trim` e mínimo de 1. Id que não existe passa do Zod e vira erro de domínio no service.

Erros de domínio, classes em `src/domain/task.ts`:

- `TaskNotFoundError` — concluir ou remover um id que não identifica tarefa.
- `TaskAlreadyDoneError` — concluir uma tarefa que já está `done`.

Entrada inválida permanece `ZodError` na borda. Não vira classe de domínio e não chega ao service. Falha de parse JSON também fica na borda.

Store:

- `allocateId(): string` — próximo inteiro decimal em string, começando em `"1"`. O contador só aumenta. Remover não devolve o id ao contador.
- `insert(task)` — acrescenta no fim.
- `list()` — cópia na ordem de inserção.
- `findById(id)` — a tarefa ou ausência.
- `update(task)` — substitui pelo mesmo id, na mesma posição.
- `delete(id)` — remove se existir.

O service:

- `createTask(title)` — `allocateId`, status `open`, `insert`, devolve a tarefa.
- `listTasks(filter)` — `list` e filtra. `all` devolve a lista inteira.
- `completeTask(id)` — ausente lança `TaskNotFoundError`; `done` lança `TaskAlreadyDoneError`; `open` atualiza para `done` e devolve a tarefa.
- `removeTask(id)` — ausente lança `TaskNotFoundError`; existente é removida.

O service confia no título que a borda já validou.

## 3. Contratos

### HTTP

Servidor `node:http` em `127.0.0.1:3000`. Corpo de sucesso e de erro é JSON com `Content-Type: application/json; charset=utf-8`. Erro tem a forma `{ "error": "<código>", "message": "<texto>" }`.

| Operação | Pedido | Sucesso | Erro |
| --- | --- | --- | --- |
| Criar | `POST /tasks` com `{ "title": "..." }` | `201` e a tarefa `{ "id", "title", "status": "open" }` | `400` `validation_error` |
| Listar | `GET /tasks` ou `GET /tasks?status=all\|open\|done` | `200` e `{ "tasks": [ ... ] }` | `400` `validation_error` se `status` vier e for inválido |
| Concluir | `POST /tasks/:id/complete` sem corpo | `200` e a tarefa com `status: "done"` | `400` id vazio; `404` `task_not_found`; `409` `task_already_done` |
| Remover | `DELETE /tasks/:id` | `204` sem corpo | `400` id vazio; `404` `task_not_found` |

`POST /tasks` exige corpo JSON. JSON inválido responde `400` `validation_error` e não altera o store. Rota ou método desconhecido responde `404` com código `route_not_found`, distinto de `task_not_found`.

### CLI

`npm run cli -- <comando>`. `runCli(argv, service)` devolve o código de saída. O entrypoint repassa `process.argv` e encerra com esse código. Sucesso escreve um JSON em stdout. Falha escreve `{ "error", "message" }` em stderr.

| Comando | Sucesso | Falha |
| --- | --- | --- |
| `create --title "..."` | exit `0` e a tarefa criada | exit `1` se o título for inválido |
| `list` ou `list --status all\|open\|done` | exit `0` e `{ "tasks": [ ... ] }` | exit `1` se `--status` for inválido |
| `complete --id <id>` | exit `0` e a tarefa `done` | exit `1` para id vazio, inexistente ou já `done` |
| `remove --id <id>` | exit `0` e `{ "id": "<id>", "removed": true }` | exit `1` para id vazio ou inexistente |

Comando desconhecido, ou comando conhecido sem a flag obrigatória, termina com exit `2` e `usage_error`. Exit `0` é só operação aceita. Exit `1` cobre validação e erro de domínio.

Os códigos `validation_error`, `task_not_found`, `task_already_done` e `usage_error` são os mesmos textos usados no HTTP, para as duas bordas nomearem a mesma falha.

## 4. Decisões e trade-offs

- Id sequencial em string (`"1"`, `"2"`, …), guardado no store. É curto para digitar na CLI e estável nos testes. O contador não recua, então um id removido não volta. UUID evitaria enumeração; autenticação está fora de escopo, e o id sequencial é a escolha deste plano.
- Lista em array, não em `Map`. O array guarda a ordem de criação sem campo extra. O custo é busca linear por id, aceitável para o conjunto em memória deste processo.
- Concluir é `POST /tasks/:id/complete`, sem corpo. O contrato não oferece reabrir nem editar. Um `PATCH` com status livre abriria esses dois casos, que a spec exclui.
- A listagem vai no query `status`. Sem a chave, a borda aplica `all`.
- CLI em JSON na mesma forma do HTTP. Teste lê stdout sem parser de texto solto. O custo é uma saída menos legível no terminal.
- `npm run dev` e `npm run cli` não compartilham memória. Cada um cumpre a vida útil de um processo. O cenário “as duas bordas veem os mesmos dados” é o teste que injeta um único service em `createHttpServer` e `runCli`. Fazer a CLI chamar o servidor em `localhost:3000` cruzaria processos e passaria a ver tarefas de outro processo, o que a spec não pede.
- Validação é Zod na borda. Regra de negócio é classe de erro no service, traduzida na borda. O service não importa Zod para rejeitar título: a borda já entregou título válido.
- Sem limite de tamanho de título, sem paginação e sem persistência em disco, como a spec deixou fora.

Pontos para a revisão humana confirmar antes de implementar:

1. Processos separados de `dev` e `cli`, com compartilhamento só no teste de composição.
2. Id sequencial em vez de UUID.
3. Status HTTP `201`, `200`, `204`, `400`, `404`, `409` e exits CLI `0`, `1`, `2`.
4. JSON como saída da CLI.
5. `POST /tasks/:id/complete` e o query `status`.

## 5. Estratégia de testes

`node:test` via `npm test`, mais `npm run typecheck`. Cada arquivo abaixo nasce com o comportamento que cobre. Store de teste é `MemoryTaskStore` novo por caso; o service também é exercitado com um store falso quando o caso precisa observar a chamada.

- Store: ordem de inserção, id que não se repete depois de remover, `update` na mesma posição, `delete`, `findById` ausente.
- Service: cria `open` com o id do store; aceita títulos iguais; lista `all`, `open` e `done` na ordem de criação, inclusive lista vazia; concluir `open` passa a `done` e mantém o título; concluir `done` lança `TaskAlreadyDoneError` sem mudar o store; concluir ou remover id ausente lança `TaskNotFoundError`; remover some das três listagens; o mesmo id depois da remoção segue ausente.
- Schemas, no teste de domínio: trim, título vazio, título só com espaços, filtro inválido, ausência de filtro tratada pela borda como `all`, id vazio.
- HTTP, com `listen(0)` e `fetch`: os quatro sucessos e os status da tabela; JSON inválido e filtro inválido não mudam a lista; rota desconhecida usa `route_not_found`.
- CLI, chamando `runCli` sem spawn: os quatro sucessos, exits `1` e `2`, stderr com o código de erro.
- Composição: um service, uma criação pela função HTTP e a listagem pelo `runCli` devolvem a mesma tarefa; o inverso também; uma operação inválida numa borda não altera o que a outra lê.
- Dois `MemoryTaskStore` criados em seguida não compartilham tarefas. Isso cobre o processo novo vazio, sem subir e derrubar o servidor.

## 6. Riscos

- A spec pede as duas bordas no mesmo processo, e os scripts npm sobem processos diferentes. Quem testar no terminal com `dev` numa aba e `cli` na outra vai ver listas vazias independentes. O aceite automatizado precisa ser o teste de composição, senão o comportamento parece quebrado.
- Id sequencial é previsível. Combinado com a ausência de autenticação, qualquer cliente local alcança qualquer tarefa do processo. Está dentro do escopo atual; deixa de estar se a API sair da máquina local.
- A busca por id é linear. Um volume alto no mesmo processo degrada listar e concluir. A spec não pede limite nem índice.
- Título sem tamanho máximo pode gerar um JSON grande em memória. A spec deixa o limite de fora; a borda não corta o texto.
- Corpo HTTP precisa ser lido por completo antes de validar e mutar. Se o handler mutar antes de terminar a leitura, pedidos concorrentes se cruzam. A implementação mantém a mutação síncrona depois do parse.
