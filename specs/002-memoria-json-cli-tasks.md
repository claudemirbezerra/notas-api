# Tarefas 002 — Memória JSON da CLI

Quebra de [spec 002](002-memoria-json-cli-spec.md) e [plano 002](002-memoria-json-cli-plan.md). Cada item cabe em um commit. Em toda tarefa, `npm test` e `npm run typecheck` terminam verdes. Nenhuma regra nova entra sem o teste citado no critério de pronto. Teste que cria arquivo usa `mkdtemp` em `os.tmpdir()` e apaga o diretório ao final. Nenhum teste grava `tasks.json` no diretório do repositório.

1. -[ x ] Schema da memória
   - Depende de: nenhuma.
   - Arquivos: `src/domain/task.ts`, `src/domain/task.test.ts`.
   - `taskMemorySchema`: raiz array de objetos strict com `id`, `title` e `status`. `id` e `title` são strings não vazias e iguais ao próprio `trim`. `status` é `open` ou `done`. Ids repetidos falham. O domínio não faz IO e não executa `parse` fora dos testes do schema.
   - Pronto: o teste de domínio passa para lista válida na ordem do array, array vazio, raiz que não é array, chave extra, título ausente, vazio, só com espaços ou com espaço na ponta, id vazio ou com espaço na ponta, estado fora de `open` e `done`, e ids repetidos.

2. -[ x ] Erros da memória
   - Depende de: nenhuma.
   - Arquivos: `src/domain/errors.ts`, `src/domain/errors.test.ts`.
   - `InvalidTaskMemoryError` com código `invalid_task_memory` e mensagem `tasks.json não contém uma lista de tarefas válida`. `TaskMemoryIoError` com código `task_memory_io` e mensagem `Não foi possível ler tasks.json` ou `Não foi possível gravar tasks.json`. As duas são `AppError`. `toHttpError` não ganha código novo.
   - Pronto: o teste de erros passa para os dois códigos, as duas mensagens de IO e a mensagem fixa de conteúdo inválido. `toErrorBody` devolve esse código e essa mensagem, sem texto cru de Zod.

3. -[ x ] Store de arquivo: abrir
   - Depende de: 1, 2.
   - Arquivos: `src/store/file-task-store.ts`, `src/store/file-task-store.test.ts`.
   - `FileTaskStore.open(filePath)` implementa `TaskStore`. Ausência (`ENOENT`) e conteúdo só com espaços em branco abrem lista vazia, próximo id `"1"`, e não criam o arquivo. `[]` e uma lista válida abrem sem reescrever os bytes. A ordem do array é a ordem da lista. UTF-8 inválido, BOM, JSON ilegível e falha do schema lançam `InvalidTaskMemoryError` com os bytes iguais. Erro de leitura que não seja ausência, coberto por dublê, e caminho que é diretório lançam `TaskMemoryIoError` sem apagar o caminho. O próximo id é o maior inteiro decimal sem zero à esquerda, mais um, no mínimo `"1"`. Id que não casa com esse formato continua ocupado e não é devolvido por `allocateId`. Nesta tarefa, `insert`, `update` e `delete` ainda só mudam a lista em memória e não gravam. A interface `TaskStore` não ganha método. `MemoryTaskStore`, service e HTTP não mudam.
   - Pronto: o teste do store passa para ausência, arquivo em branco, `[]` com bytes iguais, lista válida sem reescrever, JSON ilegível, BOM, raiz inválida, chave extra, título vazio, título com espaço na ponta, estado inválido, ids repetidos, diretório no lugar do arquivo, leitura que falha no dublê, próximo id depois do maior id decimal, e id não decimal ocupando a lista.

4. -[ x ] Store de arquivo: gravar
   - Depende de: 3.
   - Arquivos: `src/store/file-task-store.ts`, `src/store/file-task-store.test.ts`.
   - `insert`, `update` e `delete` que mudam a lista gravam o array inteiro com `JSON.stringify(tasks)` mais `\n`, por arquivo temporário no mesmo diretório e `rename` por cima do destino. A lista interna só é substituída depois da gravação bem-sucedida. `update` e `delete` de id ausente não gravam. Remover a última tarefa grava `[]\n` e não apaga o arquivo. Se a escrita ou o `rename` falha, o temporário é removido, o destino anterior permanece ou continua ausente, a lista interna não muda e o store lança `TaskMemoryIoError` de gravação. O adaptador de arquivo fica no próprio módulo, com implementação Node padrão; o teste de falha usa dublê, sem mock global de `node:fs`. Uma abertura nova, depois de remover o maior id e gravar, pode devolver esse id de novo. Dentro da mesma abertura o contador não recua.
   - Pronto: o teste do store passa para `insert` criando o arquivo e a abertura seguinte vendo a tarefa, `update` na mesma posição, `delete` removendo o item, último `delete` deixando exatamente `[]\n`, no-op sem mudar bytes, falha de gravação sem alterar a lista interna nem o destino e sem deixar temporário, e id removido reaproveitado só numa abertura nova.

5. -[ x ] CLI: memória entre invocações
   - Depende de: 4.
   - Arquivos: `src/cli.ts`, `src/cli.test.ts`.
   - `runPersistentCli(argv, filePath, io)` abre o `FileTaskStore` nesse caminho e, se abrir, chama `runCli` com um `TaskService` novo. `runCli(argv, service, io)` permanece com a mesma assinatura e os testes in-memory atuais continuam iguais. Os casos novos chamam `runPersistentCli` duas vezes no mesmo arquivo temporário, sem spawn. O entrypoint ainda não muda nesta tarefa.
   - Pronto: o teste da CLI passa para criar e listar de novo com o mesmo id, título sem espaços nas pontas e `open`; duas criações na ordem, com ids diferentes; concluir e remover visíveis na invocação seguinte, concluir sem trocar a posição relativa; listar sem arquivo não cria `tasks.json`; criar a partir de arquivo ausente ou em branco cria o arquivo; listar `[]` não muda os bytes; dois diretórios temporários não enxergam as tarefas um do outro.

6. -[ x ] CLI: arquivo inválido e falha sem gravar
   - Depende de: 5.
   - Arquivos: `src/cli.ts`, `src/cli.test.ts`.
   - A abertura ocorre antes de despachar o comando. Conteúdo inválido termina em exit `1`, stderr com `invalid_task_memory`, stdout vazio, bytes iguais, inclusive se o argv for comando desconhecido. Comando desconhecido ou flag ausente, com arquivo ausente, em branco ou válido, continua exit `2` e `usage_error`, sem criar nem alterar o arquivo. Título inválido, filtro inválido, id inexistente e concluir tarefa já `done` continuam exit `1` com o código da spec 001 e não mudam o arquivo. `runPersistentCli` repassa o adaptador de arquivo do store, com o adaptador Node como padrão, para o teste injetar falha de gravação. Falha de gravação num `create` válido termina em exit `1` com `task_memory_io` e conserva a ausência ou o conteúdo anterior.
   - Pronto: o teste da CLI passa para conteúdo inválido com comando conhecido e com comando desconhecido, uso incorreto sem arquivo, uso incorreto com arquivo válido, rejeições da spec 001 sem mudar bytes, e gravação injetada que falha sem deixar tarefa no arquivo.

7. -[ x ] Entrypoint da CLI e gitignore
   - Depende de: 6.
   - Arquivos: `src/cli.ts`, `.gitignore`.
   - Quando `src/cli.ts` é o entrypoint, o processo chama `runPersistentCli(process.argv, path.join(process.cwd(), "tasks.json"))` e `process.exit` com o código devolvido. Não há caminho configurável. `src/index.ts`, `src/http/**`, `src/service/**` e `MemoryTaskStore` permanecem sem mudança de comportamento. A linha `/tasks.json` entra no `.gitignore` da raiz; se o arquivo não existir, criá-lo só com essa regra.
   - Pronto: `npm test` e `npm run typecheck` passam; os testes existentes de HTTP, service, composição e CLI in-memory seguem verdes; o entrypoint não compõe mais `MemoryTaskStore`; `.gitignore` contém `/tasks.json`.
