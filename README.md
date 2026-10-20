# notas-api

Esqueleto de uma API de notas em Node.js com TypeScript, usando módulos ES (`"type": "module"`).

A configuração do projeto já está pronta. Ainda não existe código de entrada da aplicação: a pasta `src/` não foi criada.

## Requisitos

- Node.js (validado com a versão 24)
- npm

## Como inicializar

Na pasta do projeto:

```bash
cd notas-api
npm install
```

Isso instala a dependência `zod` e as dependências de desenvolvimento `typescript`, `tsx` e `@types/node`.

## Como executar

Os scripts abaixo estão definidos no `package.json`. Eles só funcionam depois que existir pelo menos um arquivo TypeScript em `src/`. Hoje a pasta não existe, então `npm run dev`, `npm run cli`, `npm test` e `npm run typecheck` falham. O typecheck, em particular, responde com `TS18003` (nenhum arquivo de entrada encontrado).

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Executa `tsx src/index.ts` |
| `npm run cli` | Executa `tsx src/cli.ts` |
| `npm test` | Roda os testes `src/**/*.test.ts` com `node --import tsx --test` |
| `npm run typecheck` | Verifica os tipos com `tsc --noEmit`, sem gerar arquivos |

## Stack

- **Runtime:** Node.js, módulos ES
- **Dependência:** `zod`
- **Desenvolvimento:** `typescript`, `tsx`, `@types/node`

## TypeScript

O `tsconfig.json` compila com:

- `target`: ES2022
- `module` e `moduleResolution`: NodeNext
- `strict`, `esModuleInterop`, `skipLibCheck` e `forceConsistentCasingInFileNames`: `true`
- `rootDir`: `src`
- `outDir`: `dist`
- `include`: `["src"]`

Não há script de build. A saída em `dist/` só aparece se o TypeScript for invocado de forma que emita arquivos.

## Estrutura

```
notas-api/
├── .gitignore
├── package.json
├── package-lock.json
└── tsconfig.json
```

O `.gitignore` deixa de fora do Git:

- `node_modules/`
- `.env` e `.env.*`
- `dist/`
