/**
 * vault/initVault.js — Vault initialization and onboarding content.
 */

import { el } from './shared.js'
import { getTemplatesDir } from './shared.js'
import { _getAllMdPaths } from './pathUtils.js'

// ── Onboarding note (single, at vault root) ─────────────────────────────────

const ONBOARDING_NOTA = {
  filename: 'Como escrever',
  body: `# Como escrever

O Paraverso usa **markdown** puro — a mesma sintaxe do Obsidian, GitHub, Notion.

## Formatação básica

- **Negrito** com \`**texto**\`
- *Itálico* com \`*texto*\`
- ~~Tachado~~ com \`~~texto~~\`
- \`Código inline\` com crases

## Títulos

Use \`#\` pra H1, \`##\` pra H2, e assim por diante até \`######\`.

## Listas

- Item
- Outro item
  - Sub-item (Tab pra indentar)

## Tarefas

- [ ] Tarefa pendente
- [x] Tarefa feita

## Wikilinks — o coração do app

Escreva \`[[\` e o autocomplete abre com suas notas. Confirme com Enter.

Se a nota não existe, o link fica pendente — quando você clicar nele, a nota é criada automaticamente no caderno ativo.

Wikilinks suportam alias: \`[[Título real|texto exibido]]\`.
`,
}

// ── Initial templates ────────────────────────────────────────────────────────

const TEMPLATES_INICIAIS = [
  {
    filename: 'Nota diária.md',
    body: `{{date}} {{time}}

Categorias: #Nota_Dia

- [ ]
- [ ]
- [ ]
- [ ]
- [ ]
`,
  },
  {
    filename: 'Nota.md',
    body: `{{date}} {{time}}

Conexões:

{{Title}}

-

## Referências

-
`,
  },
]

// ── Machine Claude guide (created at vault root for visibility) ──────────────

const MACHINE_CLAUDE_GUIDE = `# Como usar o Claude no terminal

O Paraverso funciona melhor com o **Claude Code** instalado. É uma IA que roda no seu terminal, dentro da pasta do vault — ela lê e escreve notas direto aqui.

## Instalar

Site oficial: https://claude.com/claude-code

Siga as instruções da página pra instalar na sua máquina.

## Usar

1. Abra o terminal
2. Navegue até a pasta do seu vault:
   \`\`\`
   cd "caminho/do/vault"
   \`\`\`
3. Rode:
   \`\`\`
   claude
   \`\`\`

Pronto. Agora você pode pedir coisas em linguagem natural:

- "Resume minhas últimas 5 notas diárias"
- "Cria uma nota sobre X linkando com Y e Z"
- "Organiza minha Inbox agrupando por tema"
- "Lê minha nota [[Produtividade]] e sugere 3 conexões"

O Claude vê a pasta \`_machine/\` (onde ele guarda o que aprendeu sobre você) mas **também** vê todas as suas notas humanas. Ele escreve em \`_machine/\` por padrão pra não bagunçar seu vault — você pode mover depois se quiser.

---

## A skill mais importante: **contexto**

De todas as skills que você pode criar ou usar, a mais importante é a **skill de contexto**: ela faz o Claude **ler o seu vault inteiro, aprender sobre você, e escrever o que aprendeu** em \`_machine/contexts/contexto.md\`.

É isso que transforma o Claude de um assistente genérico em um parceiro que entende **você**: como você pensa, como você escreve, o que te interessa, quais projetos você tem em andamento.

Quanto mais você usa essa skill, mais rica fica a nota de contexto, e melhor ficam TODAS as outras respostas do Claude no vault — porque toda pergunta futura passa a ser respondida com esse contexto carregado.

**Como usar:**

1. Deixe o vault populado com algumas notas suas (mesmo que poucas)
2. No Claude terminal, digite \`/contexto\` (se a skill estiver instalada) ou peça em linguagem natural: *"Lê o meu vault inteiro e atualiza \`_machine/contexts/contexto.md\` com o que você aprendeu sobre mim"*
3. Claude vai ler tudo, identificar padrões (temas recorrentes, forma de escrever, interesses, projetos) e atualizar o arquivo de contexto
4. Das próximas vezes que você abrir o Claude no vault, ele começa já sabendo quem você é

Faça isso pelo menos uma vez por semana — o contexto evolui junto com você.

---

## Outras skills

O Claude tem o conceito de **skills**: instruções em markdown que viram atalhos reutilizáveis, ativados com \`/nome-da-skill\`. Elas ficam em \`~/.claude/skills/\`.

Exemplo em texto (ilustrativo — não está criada):

\`\`\`
~/.claude/skills/review-semanal/SKILL.md

---
name: review-semanal
description: Revisa a Inbox do vault e sugere organização por tema.
---

Leia todas as notas em Inbox/. Para cada uma:
1. Classifique como: lixo, ideia permanente, tarefa, ou continua inbox.
2. Sugira 1 wikilink pra uma nota existente do vault.
3. Se for ideia permanente, sugira o caderno destino.

Apresente como tabela e espere eu aprovar antes de mover algo.
\`\`\`

Com isso, basta digitar \`/review-semanal\` no Claude e ele roda essa rotina toda.

Você descobre as skills disponíveis digitando \`/\` no Claude. Pra criar as suas, é só um arquivo markdown na pasta certa — o Claude detecta automaticamente.

---

Essa é a introdução mínima. O resto você descobre usando.
`

// ── Helper: write onboarding note with full YAML frontmatter ─────────────────

async function _writeOnboardingNote(vaultPath, caderno, filename, body) {
  const id = crypto.randomUUID()
  const now = Date.now()
  const yaml = [
    '---',
    `id: ${id}`,
    `titulo: ${JSON.stringify(filename)}`,
    ...(caderno ? [`caderno: ${JSON.stringify(caderno)}`] : []),
    `tags: []`,
    `criadaEm: ${now}`,
    `editadaEm: ${now}`,
    '---',
    '',
  ].join('\n')
  const parts = caderno ? [vaultPath, caderno, filename + '.md'] : [vaultPath, filename + '.md']
  const filePath = await el().joinPath(...parts)
  await el().writeFile(filePath, yaml + body)
}

// ── Vault CLAUDE.md — AI instructions for Claude Code running inside the vault
// Kept minimal and universal. Power users customize it themselves.

const VAULT_CLAUDE_MD = `# Vault instructions

## Where to write
Write AI-generated notes inside \`_machine/\`. Never modify notes outside \`_machine/\` unless explicitly asked.

## Wikilinks
Use \`[[Note Title]]\` when referencing a concept the user likely already has a note about. Don't force links — only when the connection is natural. Don't scan the vault to find titles; just link based on what you know about the user.

## Tone
Match the user's writing style. Read a few of their notes before writing.
`

// ── initVault ────────────────────────────────────────────────────────────────

export async function initVault(vaultPath) {
  // Reset vault-specific configs ALWAYS — prevents leaking from previous vault.
  // Config is global (userData/config.json), not per-vault, so previous vault
  // settings (defaultCaderno, journalCaderno, templatesDir) carry over otherwise.
  try {
    await el().setConfig?.('defaultCaderno', '')
    await el().setConfig?.('journalCaderno', '')
    await el().setConfig?.('templatesDir', 'templates')
  } catch (err) {
    console.warn('[initVault] Falha ao resetar configs:', err?.message)
  }

  await el().mkdir(await el().joinPath(vaultPath, 'meses'))
  await el().mkdir(await el().joinPath(vaultPath, getTemplatesDir()))

  try {
    const allPaths = await _getAllMdPaths(vaultPath).catch(() => [])

    if (allPaths.length === 0) {
      // Write single onboarding note at vault root (no folder)
      await _writeOnboardingNote(vaultPath, '', ONBOARDING_NOTA.filename, ONBOARDING_NOTA.body)

      // Write Claude guide at vault root (visible to user)
      const claudeGuidePath = await el().joinPath(vaultPath, 'Como usar Claude.md')
      if (!(await el().exists(claudeGuidePath))) {
        await _writeOnboardingNote(vaultPath, '', 'Como usar Claude', MACHINE_CLAUDE_GUIDE)
      }

      // Write default templates
      for (const tpl of TEMPLATES_INICIAIS) {
        const tplPath = await el().joinPath(vaultPath, getTemplatesDir(), tpl.filename)
        const exists = await el().exists(tplPath)
        if (!exists) await el().writeFile(tplPath, tpl.body)
      }

      // Create _machine/ for AI workspace
      try {
        const machineDir = await el().joinPath(vaultPath, '_machine')
        await el().mkdir(machineDir)
      } catch (err) {
        console.warn('[initVault] Falha ao criar _machine:', err?.message)
      }

      // Write CLAUDE.md — AI instructions for Claude Code in this vault
      try {
        const claudeMdPath = await el().joinPath(vaultPath, 'CLAUDE.md')
        if (!(await el().exists(claudeMdPath))) {
          await el().writeFile(claudeMdPath, VAULT_CLAUDE_MD)
        }
      } catch (err) {
        console.warn('[initVault] Falha ao criar CLAUDE.md:', err?.message)
      }
    }
  } catch (err) {
    console.warn('[initVault] Falha no onboarding:', err?.message)
  }
}
