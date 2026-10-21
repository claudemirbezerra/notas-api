# Plano 002 — Memória JSON da CLI

Plano técnico da [spec 002](002-memoria-json-cli-spec.md). A spec 001 e o código atual permanecem a base: o service não muda, a HTTP continua com `MemoryTaskStore`, e a CLI passa a abrir um store de arquivo. Este documento fixa o como; a implementação espera revisão humana.

## 1. Arquitetura

Dependências continuam só neste sentido: `cli` → `service` → `store`. O domínio não faz IO. O service não importa `fs`, não importa a CLI e não conhece `tasks.json`. A HTTP não é alterada.

O arquivo é entrada externa que não existia na spec 001. A fronteira dessa entrada é o store de arquivo: o schema Zod fica declarado no domínio e o `parse` roda em `FileTaskStore.open`, antes de a lista virar o array interno. O service segue recebendo só `Task` já aceita.

Cada invocação da CLI continua sendo um processo e um comando. O entrypoint deixa de compor `MemoryTaskStore` e passa a abrir `tasks.json` no diretório de trabalho atual. `runCli(argv, service, io)` permanece como está, recebendo o service por parâmetro. Os testes atuais da CLI injetam `MemoryTaskStore` e não passam a tocar disco.

```text
src/domain/task.ts                      schema da lista persistida
src/domain/errors.ts                    InvalidTaskMemoryError, TaskMemoryIoError
src/store/task-store.ts                 interface TaskStore, sem método novo
src/store/memory-task-store.ts          inalterado; a HTTP segue usando esta classe
src/store/file-task-store.ts            lê, valida, grava e implementa TaskStore
src/store/file-task-store.test.ts
src/cli.ts                              runPersistentCli e entrypoint com process.cwd()
src/cli.test.ts                         casos da memória, sem mudar os casos in-memory
src/index.ts                            inalterado
src/http/**                             inalterado
src/service/**                          inalterado
.gitignore                              ignora /tasks.json na raiz do repositório
```

Composição da CLI:

- `runPersistentCli(argv, filePath, io)` chama `FileTaskStore.open(filePath)`. Se a abertura lança, escreve o erro em stderr, devolve exit `1` e não chama o service.
- Se a abertura retorna, segue com `runCli(argv, new TaskService(store), io)`.
- O entrypoint usa `path.join(process.cwd(), "tasks.json")` e encerra com o código devolvido.
- `insert`, `update` e `delete` gravam o arquivo depois de calcular o próximo array. `list`, `findById` e `allocateId` não gravam.
- `npm run dev` não instancia `FileTaskStore`. Tarefas da HTTP não entram em `tasks.json`.

A interface `TaskStore` não ganha `save` nem `load`. A gravação fica dentro das mutações do store de arquivo, então um comando que o service rejeita antes de `update` ou `delete` não chega a gravar. Listar só chama `list`.

## 2. Modelo de dados

A tarefa persistida é a mesma `Task` da spec 001: `id`, `title`, `status`. Não há campo de ordem nem contador no arquivo. A ordem de criação é a posição no array JSON.

Forma gravada pela CLI: um único valor JSON, array, codificação UTF-8, sem BOM, produzido por `JSON.stringify(tasks)` mais um `\n` final. Exemplo do que a CLI passa a escrever:

```json
[{"id":"1","title":"comprar leite","status":"open"}]
```

Schema Zod `taskMemorySchema`, em `src/domain/task.ts`:

- A raiz é um array. Objeto, `null`, número ou string na raiz falha.
- Cada item é objeto strict com as três chaves. Chave extra falha.
- `id`: string não vazia, igual ao próprio `trim`.
- `title`: string não vazia, igual ao próprio `trim`. Título vazio ou só com espaços falha. Título com espaço na ponta falha, em vez de ser regravado por baixo.
- `status`: `"open"` ou `"done"`.
- Ids repetidos falham. A comparação é a string exata do arquivo.

`FileTaskStore.open` lê o caminho recebido:

- Arquivo ausente (`ENOENT`): lista vazia, próximo id `"1"`, sem criar o arquivo.
- Conteúdo vazio ou só com espaços em branco, inclusive quebras de linha: o mesmo que ausente, sem reescrever.
- Bytes que não são UTF-8 válido: `InvalidTaskMemoryError`. A leitura usa decodificador fatal, para não trocar byte inválido por caractere de reposição e seguir em frente.
- UTF-8 com BOM, JSON ilegível, ou JSON que não passa no schema: `InvalidTaskMemoryError`.
- Qualquer outro erro de leitura (`EACCES`, `EISDIR`, `EPERM`): `TaskMemoryIoError`. O caminho não é apagado.

Próximo id, calculado só na abertura, não gravado:

- Entre os ids que casam com `0` ou com um inteiro decimal sem zero à esquerda, o próximo é o maior mais um, em inteiro arbitrário, no mínimo `"1"`.
- Id que não casa com esse formato continua ocupado, mas não entra na conta do máximo.
- `allocateId` pula qualquer string que já esteja na lista.
- Remover uma tarefa não guarda o id. Na invocação seguinte ele pode voltar. A spec deixa isso fora de escopo. Dentro de uma mesma abertura, o contador só aumenta, como no `MemoryTaskStore`.

Gravação, só em `insert`, `update` e `delete` que de fato mudam a lista:

- O store monta o próximo array, serializa, grava e só então substitui o array interno.
- Se a gravação lança, o array interno e o contador já avançado ficam só neste processo. O comando falha. A próxima invocação relê o arquivo anterior e recalcula o id.
- `update` ou `delete` de id ausente não grava. O service já não chama esses casos; o store mantém o mesmo no-op do `MemoryTaskStore`.
- Remover a última tarefa grava `[]\n`. Não apaga `tasks.json`. Ausência e `[]` listam vazio, mas uma remoção bem-sucedida deixa o arquivo representando o conjunto vazio.
- A primeira alteração bem-sucedida com arquivo ausente cria `tasks.json`.

Mecanismo da gravação, no mesmo diretório do destino, para o `rename` não cruzar volume:

- Escreve `tasks.json.<pid>.<aleatório>.tmp` ao lado do destino.
- `rename` do temporário para `tasks.json`, substituindo o destino se ele existir.
- Se o `rename` ou a escrita do temporário falha, apaga o temporário se ele tiver sido criado, lança `TaskMemoryIoError` e não altera o destino. Se o destino não existia, continua ausente.

Erros novos, classes em `src/domain/errors.ts`, traduzidas pela CLI com `toErrorBody`:

- `InvalidTaskMemoryError`, código `invalid_task_memory`, mensagem fixa `tasks.json não contém uma lista de tarefas válida`.
- `TaskMemoryIoError`, código `task_memory_io`, mensagem fixa `Não foi possível ler tasks.json` ou `Não foi possível gravar tasks.json`.

A mensagem não usa o texto cru do Zod nem o stack. O caminho do arquivo fica de fora da mensagem, para o stderr não depender da máquina.

## 3. Contratos

Nenhum comando, flag ou rota nova. A HTTP permanece o contrato da spec 001 e não lê nem grava `tasks.json`.

A CLI continua `npm run cli -- <comando>`, com a mesma stdout e os mesmos exits `0`, `1` e `2` da spec 001. O que muda é de onde as tarefas vêm e quando o arquivo muda.

| Situação | Stdout | Stderr | Exit | Arquivo no cwd |
| --- | --- | --- | --- | --- |
| `create`, `complete` ou `remove` aceitos | o mesmo JSON da spec 001 | vazio | `0` | `tasks.json` passa a ser o conjunto resultante |
| `list` com arquivo ausente, em branco ou `[]` | `{ "tasks": [] }` | vazio | `0` | inalterado; ausência continua ausência |
| `list` com lista válida | `{ "tasks": [ ... ] }` na ordem do arquivo | vazio | `0` | bytes inalterados |
| Título, filtro ou id rejeitados, ou erro de domínio | vazio | `validation_error`, `task_not_found` ou `task_already_done` | `1` | bytes inalterados; ausência continua ausência |
| Conteúdo inválido, em qualquer comando, inclusive comando desconhecido | vazio | `invalid_task_memory` | `1` | bytes inalterados |
| Leitura ou gravação impossível | vazio | `task_memory_io` | `1` | destino anterior preservado, ou ainda ausente |
| Comando desconhecido ou flag ausente, com arquivo ausente, em branco ou válido | vazio | `usage_error` | `2` | bytes inalterados |

`runPersistentCli` abre o arquivo antes de despachar o comando. Por isso um `tasks.json` inválido responde `invalid_task_memory` mesmo que o argv também fosse `usage_error`. Com arquivo válido, o `usage_error` da spec 001 continua exit `2`.

Dois diretórios de trabalho são dois arquivos. O caminho é absoluto, resolvido uma vez na abertura. A CLI não procura `tasks.json` em diretório pai nem na pasta do código-fonte.

## 4. Decisões e trade-offs

- Store de arquivo em vez de gravar no `runCli`. O service permanece igual e os testes in-memory continuam injetando `MemoryTaskStore`. O custo é uma segunda implementação de `TaskStore`.
- O `parse` do arquivo mora no store, não em `cli.ts`. A constituição coloca Zod na fronteira HTTP/CLI; aqui a fronteira nova é o arquivo, e concentrar a leitura no store evita a CLI e o store divergirem sobre arquivo em branco, `[]` e chave extra. O service não passa a executar Zod.
- Sem `nextId` no JSON. O arquivo fica só a lista que a spec descreve. O custo é um id removido poder voltar na invocação seguinte. Persistir o contador lembraria ids removidos, o que a spec deixa fora.
- Título ou id com espaço na ponta é arquivo inválido. Um trim silencioso na leitura faria a listagem devolver texto diferente do arquivo sem poder reescrever, porque listar não grava. Falhar conserva os bytes.
- Objeto strict. Chave extra não está na lista mínima do RF-7, mas aceitá-la e omiti-la na gravação seguinte mudaria o arquivo numa operação que não pediu isso. Falhar é o comportamento estável.
- Remover a última tarefa grava `[]\n` em vez de apagar o arquivo. Os dois listam vazio; gravar `[]` distingue “a CLI removeu tudo” de “ainda não há memória”.
- Arquivo inválido é avaliado antes do argv. O usuário descobre a memória corrompida mesmo num comando incompleto. O custo é exit `1` no lugar de exit `2` quando as duas falhas acontecem juntas.
- Gravação por temporário e `rename` no mesmo diretório. Escrever direto em `tasks.json` poderia truncar o destino se o processo caísse no meio. Não há trava de arquivo: duas CLIs ao mesmo tempo continuam fora de escopo, e a última gravação pode cobrir a outra.
- `runCli` não ganha caminho de arquivo. Quem persiste é `runPersistentCli`. Assim o teste de composição da spec 001, que injeta um service só em memória, não começa a criar `tasks.json` no diretório do repositório.
- Códigos novos só na CLI. `toHttpError` não ganha mapeamento para eles. Se um `AppError` desses chegasse à HTTP, cairia no `500` genérico; a composição não deixa esse caminho acontecer.
- `/tasks.json` entra no `.gitignore` da raiz. É dado local de quem roda a CLI no repositório, não código. O padrão com barra vale só para a raiz, para não ignorar um fixture homônimo em subpasta.

Pontos para a revisão humana confirmar antes de implementar:

1. `parse` do arquivo dentro de `FileTaskStore`, com o schema ainda declarado no domínio.
2. Arquivo inválido respondido antes do comando, com exit `1`, mesmo quando o argv também seria `usage_error`.
3. Título com espaço na ponta, id com espaço na ponta e chave extra tornam o arquivo inválido.
4. Códigos `invalid_task_memory` e `task_memory_io`, ambos exit `1`, com as mensagens fixas desta seção.
5. Contador fora do arquivo e reutilização de id já removido na invocação seguinte.
6. Última remoção grava `[]\n` e não apaga `tasks.json`.
7. Temporário ao lado do destino mais `rename`, sem trava entre processos.
8. Ignorar só `/tasks.json` na raiz do git.
9. `src/index.ts`, `src/http/**`, `src/service/**` e `MemoryTaskStore` ficam sem mudança de comportamento.

## 5. Estratégia de testes

`node:test` via `npm test`, mais `npm run typecheck`. Teste de arquivo usa `mkdtemp` em `os.tmpdir()` e apaga o diretório ao final. Nenhum caso grava `tasks.json` no cwd do repositório. Os testes atuais de CLI, service, HTTP e composição permanecem com `MemoryTaskStore` e devem continuar verdes sem alteração de expectativa.

Store de arquivo, em `src/store/file-task-store.test.ts`:

- Ausente e só espaços abrem lista vazia e não criam arquivo.
- `[]` abre lista vazia e os bytes seguem iguais.
- Lista válida preserva id, título, estado e ordem, e não reescreve na abertura.
- JSON ilegível, BOM, raiz que não é array, chave extra, título vazio, título com espaço na ponta, estado fora do enum e ids repetidos lançam `InvalidTaskMemoryError` com os bytes iguais.
- `EACCES` ou caminho que é diretório lança `TaskMemoryIoError` sem apagar o caminho.
- `insert` cria o arquivo; uma segunda `open` vê a tarefa. `update` muda o estado na mesma posição. `delete` tira o item. `delete` do último deixa `[]\n`.
- `list` e abertura não mudam bytes de um arquivo já válido, inclusive um `[]` sem `\n` se for isso que estiver no disco.
- Próximo id é o maior id decimal presente mais um. Id não decimal ocupa a lista e não é devolvido por `allocateId`. Depois de remover o maior id, uma abertura nova pode devolvê-lo de novo.
- Falha injetada na gravação lança `TaskMemoryIoError`, deixa o array interno como antes do `insert` e, no adaptador real, deixa o destino intacto ou ausente e não deixa temporário para trás.

O adaptador de `fs` é uma interface pequena no próprio `file-task-store.ts`, com implementação Node padrão. O teste de falha de `rename` usa um dublê. O teste de bytes usa `fs` real no diretório temporário. Não há mock global de `node:fs`.

CLI, em `src/cli.test.ts`, chamando `runPersistentCli` duas vezes no mesmo arquivo temporário, com writers em memória:

- Criar e listar de novo devolve o mesmo id, título sem espaços nas pontas e `open`.
- Segunda criação lista as duas na ordem, com ids diferentes.
- Concluir e remover aparecem na invocação seguinte. Concluir não troca a posição relativa.
- Listar sem arquivo não cria `tasks.json`. Criar a partir de arquivo ausente ou em branco cria. Listar `[]` não muda os bytes.
- Título inválido, filtro inválido, id inexistente e concluir tarefa `done` saem exit `1` com o código da spec 001 e não mudam o arquivo.
- Conteúdo inválido sai exit `1` com `invalid_task_memory`, stdout vazio, e os bytes iguais, inclusive quando o argv é um comando desconhecido.
- Comando desconhecido com arquivo ausente continua exit `2` e não cria o arquivo.
- Dois diretórios temporários não enxergam as tarefas um do outro.
- Falha de gravação injetada num `create` válido sai exit `1` com `task_memory_io` e conserva a ausência ou o conteúdo anterior.

HTTP e composição: a suíte atual é a regressão. Não há teste novo que importe `src/index.ts`, porque esse módulo chama `listen(3000)` ao ser carregado. A garantia de que a HTTP não usa o arquivo é a composição continuar em `MemoryTaskStore`, conferida na revisão e pelo diff não tocar `src/index.ts` nem `src/http/**`.

## 6. Riscos

- Duas CLIs no mesmo `tasks.json` podem se sobrepor. A última gravação vence e pode apagar a inclusão da outra. A spec deixa o uso simultâneo fora; este plano não adiciona trava.
- Id removido pode reaparecer na próxima invocação. Quem anotou um id antigo pode atingir outra tarefa. É o efeito de não gravar o contador.
- `rename` por cima do destino depende do Node 22 no Windows substituir o arquivo. Antivírus ou o OneDrive, se a CLI for executada de dentro da pasta sincronizada, pode falhar o `rename` ou segurar o temporário. O comando deve falhar com `task_memory_io` e o destino anterior deve continuar legível. O teste automático mora em `os.tmpdir()`, então não reproduz o OneDrive.
- Um temporário órfão pode sobrar se o processo morrer entre a escrita e o `rename`. A abertura ignora esse nome e só lê `tasks.json`. Lixo no diretório é possível; corrupção do destino por escrita direta, não.
- Arquivo inválido bloqueia todos os comandos daquela pasta, inclusive os de uso incorreto. É a decisão da seção 4; quem espera exit `2` vai ver exit `1` até corrigir ou remover o arquivo à mão.
- Esquecer de usar `mkdtemp` num teste novo gravaria `tasks.json` na raiz do repositório. O `.gitignore` reduz o dano, não substitui o diretório temporário.
- `FileTaskStore` e `MemoryTaskStore` podem divergir num no-op de `update` ou `delete`. O plano manda o store de arquivo não gravar nesses no-ops e cobre isso no teste do store.
