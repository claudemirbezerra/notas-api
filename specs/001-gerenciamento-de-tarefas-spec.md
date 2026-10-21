# Spec 001 — Gerenciamento de tarefas

## Contexto / problema

Não há como registrar o que precisa ser feito, ver o que ainda está aberto, marcar uma tarefa como concluída ou descartá-la. O usuário precisa dessas operações tanto pela API HTTP quanto pela CLI, com as mesmas regras.

As tarefas existem só enquanto o processo está no ar. HTTP e CLI executados no mesmo processo enxergam o mesmo conjunto. Um processo novo começa vazio e não vê tarefas de outro processo.

Cada tarefa tem um identificador único gerado pelo sistema, um título e um estado: `open` ou `done`. A criação começa em `open`. Concluir passa de `open` para `done`. Remover tira a tarefa do conjunto.

## User stories

1. Com o usuário, quero criar uma tarefa informando o título, para registrar o que preciso fazer e receber um id estável para as próximas operações.
2. Com o usuário, quero listar as tarefas em `all`, `open` ou `done`, para ver o conjunto inteiro ou só o que ainda está aberto ou já foi concluído.
3. Com o usuário, quero concluir uma tarefa aberta pelo id, para tirá-la da lista de pendências sem apagá-la.
4. Com o usuário, quero remover uma tarefa pelo id, para descartar o que não deve mais aparecer nas listagens.
5. Com o usuário, quero as mesmas operações e as mesmas regras na HTTP e na CLI, para escolher a borda sem mudar o resultado.

## Requisitos funcionais

- RF-1. O sistema permite criar uma tarefa informando apenas o título, pela HTTP e pela CLI.
- RF-2. O título é obrigatório. O sistema considera o título depois de remover espaços nas extremidades. Título ausente, vazio ou só com espaços é rejeitado e nenhuma tarefa é criada.
- RF-3. Títulos iguais são permitidos. O id distingue as tarefas.
- RF-4. Na criação bem-sucedida, o sistema atribui um id único, define o estado `open` e devolve id, título já normalizado e estado.
- RF-5. Um id atribuído não é reutilizado por outra tarefa enquanto o processo estiver no ar.
- RF-6. O sistema permite listar tarefas pela HTTP e pela CLI com um dos filtros `all`, `open` ou `done`.
- RF-7. Sem filtro, a listagem equivale a `all`. Filtro fora de `all`, `open` e `done` é rejeitado e não devolve lista parcial.
- RF-8. `all` devolve tarefas `open` e `done`. `open` devolve só `open`. `done` devolve só `done`. Lista vazia é sucesso.
- RF-9. A ordem é a de criação, da mais antiga para a mais nova. Concluir não muda a posição relativa. Os filtros preservam essa ordem.
- RF-10. Cada item listado expõe id, título e estado.
- RF-11. O sistema permite concluir uma tarefa pelo id, pela HTTP e pela CLI. Só uma tarefa `open` pode ser concluída. O estado passa a `done` e o título permanece.
- RF-12. Concluir uma tarefa que já está `done` é erro de domínio. O estado não muda.
- RF-13. O sistema permite remover uma tarefa pelo id, pela HTTP e pela CLI, esteja ela `open` ou `done`. Depois da remoção, o id deixa de identificar uma tarefa e ela some de todas as listagens.
- RF-14. Concluir ou remover um id que não identifica tarefa é erro de domínio. O conjunto de tarefas não muda.
- RF-15. Entrada externa inválida é rejeitada na fronteira, antes de alterar tarefas. Falha previsível de negócio é erro de domínio, sinalizado como falha na HTTP e na CLI, distinto de sucesso.
- RF-16. As tarefas duram só a vida do processo. No mesmo processo, uma tarefa criada ou alterada por uma borda fica visível à outra. Ao encerrar o processo, o conjunto se perde.

## Critérios de aceite

1. Quando o usuário cria uma tarefa com título não vazio, o sistema deve gravá-la como `open`, atribuir um id novo e devolver id, título sem espaços nas extremidades e estado `open`.
2. Quando o usuário cria uma tarefa sem título, com título vazio ou só com espaços, o sistema deve rejeitar a criação e manter o conjunto inalterado.
3. Quando o usuário cria duas tarefas com o mesmo título, o sistema deve aceitar as duas, com ids diferentes, na ordem em que foram criadas.
4. Quando o usuário lista sem filtro ou com filtro `all`, o sistema deve devolver todas as tarefas, da mais antiga para a mais nova.
5. Quando o usuário lista com filtro `open` ou `done`, o sistema deve devolver só as tarefas daquele estado, preservando a ordem de criação.
6. Quando não há tarefas no filtro pedido, o sistema deve devolver uma lista vazia com sucesso.
7. Quando o usuário informa um filtro diferente de `all`, `open` e `done`, o sistema deve rejeitar a listagem.
8. Quando o usuário conclui pelo id uma tarefa `open`, o sistema deve passar o estado para `done` e mantê-la nas listagens `all` e `done`.
9. Quando o usuário conclui uma tarefa `done` ou um id inexistente, o sistema deve responder com erro de domínio e não alterar tarefas.
10. Quando o usuário remove pelo id uma tarefa existente, o sistema deve retirá-la de todas as listagens.
11. Quando o usuário conclui ou remove esse id depois da remoção, o sistema deve responder com erro de domínio.
12. Quando a mesma operação válida ou inválida é feita pela HTTP ou pela CLI no mesmo processo, o sistema deve aplicar a mesma regra e refletir o resultado na outra borda.
13. Quando o processo termina e outro começa, o sistema deve apresentar o conjunto vazio.

## Fora de escopo

- Editar título ou qualquer outro campo.
- Reabrir uma tarefa `done`.
- Descrição, prazo, prioridade, responsável ou etiquetas.
- Limite máximo de caracteres do título.
- Paginação, busca por texto e ordenação escolhida pelo usuário.
- Autenticação, autorização e múltiplos usuários.
- Persistência em disco ou compartilhamento entre processos.
- Formato de transporte, códigos de status, códigos de saída e mecanismo de geração do id.

## Questões em aberto

Nenhuma. Os pontos que mudavam o aceite foram fechados: id gerado pelo sistema, título obrigatório com trim e duplicata permitida, erro ao concluir tarefa já `done`, erro ao concluir ou remover id inexistente, dados só no processo atual e listagem da mais antiga para a mais nova.
