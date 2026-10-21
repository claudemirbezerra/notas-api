# Tarefas 001 — Gerenciamento de tarefas

Quebra de [spec 001](001-gerenciamento-de-tarefas-spec.md) e [plano 001](001-gerenciamento-de-tarefas-plan.md). Cada item cabe em um commit. Em toda tarefa, `npm test` e `npm run typecheck` terminam verdes. Nenhuma regra nova entra sem o teste citado no critério de pronto.

1. -[ x ] Domínio da tarefa
   - Depende de: nenhuma.
   - Arquivos: `src/domain/task.ts`, `src/domain/task.test.ts`.
   - Tipos `Task` e `TaskStatus` (`open` | `done`). Schemas Zod de criação (`title` com trim e mínimo 1, chaves extras descartadas), filtro (`all` | `open` | `done`, string vazia falha) e id (trim, mínimo 1). Classes `TaskNotFoundError` e `TaskAlreadyDoneError`.
   - O domínio não importa store, http, cli nem faz IO, e não executa `parse` fora dos testes do schema.
   - Pronto: o teste de domínio passa para título com espaços nas pontas, título ausente, vazio ou só com espaços, filtro inválido, filtro vazio e id vazio.

2. -[ x ] Store em memória
   - Depende de: 1.
   - Arquivos: `src/store/task-store.ts`, `src/store/memory-task-store.ts`, `src/store/memory-task-store.test.ts`.
   - Interface `TaskStore` com `allocateId`, `insert`, `list`, `findById`, `update` e `delete`. `MemoryTaskStore` guarda um array na ordem de inserção e um contador que só sobe, começando em `"1"`.
   - Pronto: o teste do store passa para ordem de inserção, id seguinte após remoção sem reutilizar o id removido, `update` na mesma posição, `delete`, `findById` ausente, e dois stores criados em seguida não compartilham tarefas.

3. -[ x ] Service de tarefas
   - Depende de: 1, 2.
   - Arquivos: `src/service/task-service.ts`, `src/service/task-service.test.ts`.
   - `createTask`, `listTasks`, `completeTask` e `removeTask` sobre `TaskStore`. A filtragem é função pura. O service não importa `src/http` nem `src/cli` e não valida título com Zod.
   - Pronto: o teste do service passa para criar `open` com o id do store, títulos iguais com ids diferentes, listas `all` / `open` / `done` na ordem de criação inclusive vazia, concluir `open` mantendo o título, `TaskAlreadyDoneError` sem alterar o store, `TaskNotFoundError` ao concluir ou remover id ausente, remoção sumindo das três listas, e id removido seguindo ausente. Pelo menos um caso observa as chamadas com um store falso.

4. -[ x ] HTTP: criar e listar
   - Depende de: 3.
   - Arquivos: `src/http/server.ts`, `src/http/server.test.ts`.
   - `createHttpServer(service)` com `node:http`. `POST /tasks` valida o JSON com o schema de criação e responde `201` com a tarefa. `GET /tasks` aplica `all` quando `status` está ausente; valor presente passa pelo schema de filtro. Erro de validação é `400` com `{ "error": "validation_error", "message" }` e não altera o store. Sucesso de listagem é `200` com `{ "tasks": [...] }`.
   - Pronto: o teste HTTP, com `listen(0)` e `fetch`, passa para criar, título inválido sem criar, listar sem filtro, `all`, `open`, `done` e filtro inválido sem alterar a lista.

5. -[ x ] HTTP: concluir, remover e rota desconhecida
   - Depende de: 4.
   - Arquivos: `src/http/server.ts`, `src/http/server.test.ts`.
   - `POST /tasks/:id/complete` e `DELETE /tasks/:id`. Id vazio é `400` `validation_error`. `TaskNotFoundError` vira `404` `task_not_found`. `TaskAlreadyDoneError` vira `409` `task_already_done`. Remoção aceita responde `204` sem corpo. JSON inválido em `POST /tasks` responde `400` `validation_error` sem alterar o store. Rota ou método desconhecido responde `404` `route_not_found`. A mutação do service só ocorre depois do parse completo do corpo.
   - Pronto: o teste HTTP passa para concluir `open`, concluir `done`, concluir id inexistente, remover, remover id inexistente, id vazio, JSON inválido e rota desconhecida.

6. -[ x ] Entrypoint HTTP
   - Depende de: 5.
   - Arquivo: `src/index.ts`.
   - Compõe `MemoryTaskStore`, o service e `createHttpServer`, e escuta em `127.0.0.1:3000`. Sem regra de negócio e sem Zod neste arquivo.
   - Pronto: `npm run typecheck` passa e a suíte já existente continua verde.

7. -[ x ] CLI: criar e listar
   - Depende de: 3.
   - Arquivos: `src/cli.ts`, `src/cli.test.ts`.
   - `runCli(argv, service)` devolve o código de saída sem encerrar o processo. `create --title` e `list` / `list --status` escrevem o JSON de sucesso em stdout e terminam com `0`. Título ou filtro inválido escreve `{ "error": "validation_error", "message" }` em stderr e termina com `1`, sem alterar o store no caso do título. O processo só chama `runCli(process.argv)` e `process.exit` quando `src/cli.ts` é o entrypoint.
   - Pronto: o teste da CLI, sem spawn, passa para criar, título inválido, listar sem filtro, `all`, `open`, `done` e filtro inválido.

8. -[ ] CLI: concluir, remover e uso
   - Depende de: 7.
   - Arquivos: `src/cli.ts`, `src/cli.test.ts`.
   - `complete --id` e `remove --id`. Sucesso em stdout com exit `0`; remoção imprime `{ "id", "removed": true }`. Id vazio, id inexistente e tarefa já `done` escrevem o código `validation_error`, `task_not_found` ou `task_already_done` em stderr e terminam com `1`. Comando desconhecido, ou comando sem a flag obrigatória, termina com `2` e `usage_error`.
   - Pronto: o teste da CLI passa para concluir, concluir tarefa já `done`, concluir id inexistente, remover, remover id inexistente, id vazio, comando desconhecido e flag obrigatória ausente.

9. -[ ] Composição das duas bordas
   - Depende de: 5, 8.
   - Arquivo: `src/composition.test.ts`.
   - Um único service vai para `createHttpServer` e para `runCli`.
   - Pronto: o teste passa para criar pela HTTP e listar pela CLI, criar pela CLI e listar pela HTTP, e uma operação inválida em uma borda não muda o que a outra lê.
