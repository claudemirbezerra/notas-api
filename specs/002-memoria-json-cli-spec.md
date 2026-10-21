# Spec 002 — Memória JSON da CLI

## Contexto / problema

Na spec 001, as tarefas existem só enquanto o processo está no ar. A CLI executa um comando por invocação. Ao terminar, o conjunto se perde, e a invocação seguinte começa vazia.

O usuário da linha de comando precisa que criar, concluir e remover sobrevivam de uma invocação para a outra. A memória é um arquivo JSON, `tasks.json`, no diretório de trabalho atual. A API HTTP permanece como na spec 001: o conjunto dela dura só a vida daquele processo e não usa esse arquivo.

Esta spec substitui, somente na CLI, a regra da spec 001 de que o conjunto se perde ao encerrar o processo. Título, estados, filtros, conclusão, remoção e erros de domínio continuam os da spec 001, aplicados ao conjunto carregado do arquivo.

## User stories

1. Com o usuário, quero que a tarefa criada na CLI continue disponível na próxima invocação no mesmo diretório, para não perder o que registrei quando o comando termina.
2. Com o usuário, quero concluir e remover na CLI e ver esse resultado na invocação seguinte, para a memória acompanhar o estado das tarefas.
3. Com o usuário, quero usar a CLI sem arquivo ou com arquivo vazio e ver a memória surgir na primeira alteração bem-sucedida, para o primeiro uso não exigir preparação.
4. Com o usuário, quero que um `tasks.json` ilegível ou incoerente faça o comando falhar sem apagar nem reescrever o arquivo, para o conteúdo não ser descartado por engano.
5. Com o usuário, quero a API HTTP sem esse arquivo, para a memória valer só entre sessões da linha de comando.

## Requisitos funcionais

- RF-1. A CLI usa o arquivo `tasks.json` do diretório de trabalho atual daquela invocação como memória das tarefas.
- RF-2. Cada invocação da CLI parte das tarefas desse arquivo. Id, título, estado e ordem de criação permanecem os mesmos na invocação seguinte, no mesmo diretório.
- RF-3. Arquivo ausente, ou existente sem conteúdo ou só com espaços em branco, equivale a nenhuma tarefa. Ler esse estado não cria nem reescreve o arquivo.
- RF-4. Uma lista JSON vazia é um conjunto vazio válido. Listar nesse caso tem sucesso, devolve lista vazia e não modifica o arquivo.
- RF-5. Criar, concluir ou remover com sucesso deixa `tasks.json` refletindo o conjunto resultante, inclusive criando o arquivo quando ele ainda não existia. A invocação seguinte, no mesmo diretório, enxerga esse conjunto.
- RF-6. Listagem e qualquer comando rejeitado, por entrada inválida ou erro de domínio, não criam nem modificam o arquivo.
- RF-7. Se `tasks.json` existe, tem conteúdo e não representa uma lista de tarefas válida, o comando falha. O arquivo não é apagado nem reescrito, e nenhuma tarefa é criada, concluída ou removida. É inválido: JSON ilegível; item sem id; título ausente, vazio ou só com espaços; estado diferente de `open` ou `done`; ids repetidos.
- RF-8. Um id presente no arquivo não é reatribuído a outra tarefa. O id devolvido na criação é o id visto nas invocações seguintes, enquanto a tarefa permanecer no arquivo.
- RF-9. Diretórios de trabalho diferentes são memórias diferentes. A CLI não lê nem grava `tasks.json` de outro diretório.
- RF-10. A HTTP não lê nem grava `tasks.json`. Tarefas criadas ou alteradas pela HTTP não entram nesse arquivo, e o conjunto da HTTP continua só na vida daquele processo.
- RF-11. Falha ao ler o arquivo, quando ele existe, ou falha ao gravá-lo depois de uma alteração válida, é falha do comando. O conteúdo anterior do arquivo permanece. Se o arquivo não existia e a gravação falha, ele continua ausente.
- RF-12. As regras da spec 001 sobre título, filtros, conclusão, remoção e erro de domínio valem para o conjunto carregado. O que muda é a duração desse conjunto na CLI: ele passa a durar entre invocações, pelo arquivo do diretório atual.

## Critérios de aceite

1. Quando o usuário cria uma tarefa válida pela CLI e invoca a CLI de novo no mesmo diretório, o sistema deve listar essa tarefa com o mesmo id, o título normalizado e o estado `open`.
2. Quando o usuário conclui ou remove pela CLI uma tarefa que está no arquivo, o sistema deve gravar o conjunto resultante, e a invocação seguinte no mesmo diretório deve mostrar esse resultado.
3. Quando `tasks.json` está ausente e o usuário lista, o sistema deve devolver lista vazia com sucesso e não criar o arquivo.
4. Quando `tasks.json` está ausente ou sem conteúdo e o usuário cria uma tarefa válida, o sistema deve gravar o arquivo com essa tarefa.
5. Quando `tasks.json` é uma lista JSON vazia e o usuário lista, o sistema deve devolver lista vazia com sucesso e deixar o arquivo como estava.
6. Quando o comando é rejeitado por título inválido, filtro inválido, id inexistente ou concluir tarefa já `done`, o sistema deve falhar sem criar nem modificar `tasks.json`.
7. Quando `tasks.json` tem conteúdo inválido, como definido no RF-7, o sistema deve falhar o comando e deixar os bytes do arquivo como estavam.
8. Quando o usuário cria duas tarefas em invocações seguidas no mesmo diretório, o sistema deve listar as duas na ordem de criação, com ids diferentes.
9. Quando o usuário invoca a CLI em outro diretório de trabalho, o sistema deve usar o `tasks.json` desse outro diretório e não o do diretório anterior.
10. Quando a API HTTP cria, lista, conclui ou remove tarefas, o sistema deve manter o comportamento da spec 001 e não ler nem gravar `tasks.json`.
11. Quando a gravação do arquivo falha depois de uma alteração válida, o sistema deve falhar o comando e preservar o conteúdo anterior, ou a ausência do arquivo.
12. Quando a mesma tarefa permanece no arquivo, o sistema deve conservar a posição relativa dela na ordem de criação depois de concluir outra tarefa ou de uma nova invocação.

## Fora de escopo

- Persistência da HTTP e qualquer sincronização entre HTTP e CLI pelo arquivo.
- Nome de arquivo diferente de `tasks.json`, outro diretório que não o de trabalho atual, e caminho configurável.
- Duas CLIs ao mesmo tempo no mesmo arquivo. Não há garantia para uso simultâneo.
- Lembrar ids de tarefas já removidas.
- Histórico, backup e bloqueio do arquivo.
- Nomes das propriedades dentro do JSON e o mecanismo de gravação.
- Editar título, reabrir tarefa e os demais itens fora de escopo da spec 001.
- Formato de transporte da HTTP, códigos de status e códigos de saída.

## Questões em aberto

Nenhuma. Os pontos que mudavam o aceite foram fechados: memória em `tasks.json` no diretório de trabalho atual; arquivo ausente ou vazio começa sem tarefas e só é gravado na primeira alteração bem-sucedida; conteúdo inválido falha sem apagar nem reescrever; só a CLI usa o arquivo; uso simultâneo fica fora de escopo.
