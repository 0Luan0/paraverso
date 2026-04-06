/**
 * vault/initVault.js — Vault initialization and onboarding content.
 */

import { el } from './shared.js'
import { getTemplatesDir } from './shared.js'
import { getNotebooks } from './folderOps.js'
import { _getAllMdPaths } from './pathUtils.js'

// ── Onboarding notes ─────────────────────────────────────────────────────────

const ONBOARDING_NOTAS = [
  {
    filename: '1. Bem-vindo ao Paraverso',
    body: `# Bem-vindo ao Paraverso 🌿

Este é o seu segundo cérebro. Um lugar pra pensar, registrar, conectar ideias.

Se você nunca usou um app de PKM (*Personal Knowledge Management*) antes, não se preocupe. Os 3 princípios que importam são:

1. **Capture first, organize later** — escreva primeiro, organize depois. Jogue tudo na \`Inbox\` sem culpa.
2. **Link > folder** — conectar notas com \`[[wikilinks]]\` vale mais do que organizar em pastas.
3. **Review semanal** — reserve 10 minutos por semana pra revisitar sua Inbox e decidir o que virou ideia permanente.

É isso. Simples. Se duvidar, volte pra esses 3 princípios.

---

Suas próximas leituras (todas aqui na Inbox):

[[2. Como escrever]] — markdown básico e wikilinks
[[3. Atalhos]] — os atalhos de teclado mais úteis
[[4. Abas do app]] — o que cada aba faz
[[5. Princípios PKM]] — aprofundando os 3 princípios acima

Boa escrita. ✍️
`,
  },
  {
    filename: '2. Como escrever',
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

## Tags

Escreva \`#nome-da-tag\` em qualquer lugar. Tags são buscáveis no \`⌘O\` e aparecem no grafo.

## Imagens e PDFs

\`Ctrl+V\` ou \`⌘V\` com uma imagem/PDF no clipboard — o arquivo vai pra pasta \`attachments/\` automaticamente e aparece inline na nota.

---

Próxima: [[3. Atalhos]]

Anterior: [[1. Bem-vindo ao Paraverso]]
`,
  },
  {
    filename: '3. Atalhos',
    body: `# Atalhos

## Navegação

| Atalho | Ação |
|---|---|
| \`⌘O\` | Abrir qualquer nota do vault (*Quick Switcher*) |
| \`⌘N\` | Nova nota (na pasta padrão) |
| \`⌘T\` | Inserir template |
| \`⌘F\` | Buscar dentro da nota atual |

## Edição

| Atalho | Ação |
|---|---|
| \`⌘B\` | Negrito |
| \`⌘I\` | Itálico |
| \`Tab\` | Indentar lista |
| \`⇧Tab\` | Desindentar |

## Na sidebar

- **Clique direito** em qualquer pasta → menu com Nova nota, Nova pasta, Renomear, Mover, Revelar no Finder, Apagar
- **Arrastar** uma pasta pra dentro de outra → ela vira subpasta. Todas as referências (journal, configs, grupos de cor do grafo) atualizam automaticamente
- **Arrastar** uma nota entre cadernos → move o arquivo

## Renomear notas

Mudar o título de uma nota renomeia o arquivo E atualiza todos os \`[[wikilinks]]\` que apontam pra ela no vault inteiro. Nada fica quebrado.

---

Próxima: [[4. Abas do app]]

Anterior: [[2. Como escrever]]
`,
  },
  {
    filename: '4. Abas do app',
    body: `# Abas do app

## 📅 Mês

Seu diário visual. Uma grade do mês com cada dia clicável. Também tem metas (por categoria) e registro de hábitos com cores. Use quando quiser registrar como foi o seu dia ou acompanhar rotina.

O botão de **nota diária** cria automaticamente uma nota no caderno \`Diário\` com o template \`Nota diária\`.

## 📝 Notas

Onde você tá agora. Sidebar com seus cadernos + editor + painel de backlinks (quem menciona a nota atual).

## 🕸️ Grafo

Visualização de todo o vault como uma rede. Cada nó é uma nota, cada linha é um \`[[wikilink]]\`. Nós são coloridos por caderno.

Dê zoom in pra ver os nomes das notas aparecerem. Clique num nó pra abrir a nota no editor.

No painel de configurações (⚙ no canto), você pode criar **grupos de cor** — regras tipo "todas as notas do caderno Projetos ficam laranja".

## ⚙️ Config

Onde você configura a pasta padrão de novas notas, a pasta das notas diárias, tema, textura do editor, e importa um vault do Obsidian.

---

Próxima: [[5. Princípios PKM]]

Anterior: [[3. Atalhos]]
`,
  },
  {
    filename: '5. Princípios PKM',
    body: `# Princípios de PKM

Esses 3 princípios vieram do *Building a Second Brain* (Tiago Forte) e do método *Zettelkasten* (Niklas Luhmann). São o mínimo que você precisa saber.

## 1. Capture first, organize later

A maior armadilha de quem começa num app assim é **travar decidindo onde guardar**. Esqueça.

Toda ideia, frase solta, trecho copiado de um livro, recado que você quer lembrar — vai pra \`Inbox\`. Sem hierarquia, sem categoria, sem tag. Só escreve.

Organizar é uma atividade **separada**, que você faz depois.

## 2. Link é mais importante que pasta

Pastas são úteis pra separar grandes contextos (Trabalho, Pessoal, Projetos). Mas a **conexão real** entre ideias acontece via \`[[wikilinks]]\`.

Uma nota sobre *produtividade* pode linkar uma sobre *sono*, que linka uma sobre *alimentação*, que linka uma sobre *disciplina*. Essa teia é o seu segundo cérebro — não as pastas.

Regra prática: se você tem dúvida entre criar uma pasta ou usar um wikilink, use wikilink.

## 3. Review semanal

Reserve **10 minutos por semana** pra:

1. Abrir a \`Inbox\`
2. Pra cada nota solta, decidir: isso é lixo, isso virou ideia permanente, isso vira projeto, ou isso fica na Inbox mais uma semana
3. Notas permanentes vão pra um caderno próprio (ou continuam na Inbox com wikilinks)
4. Lixo vai pra \`Arquivo\` (ou é apagado)

Sem review, a Inbox vira lixão. Com review, vira mina de ouro.

## MOC — Map of Content

Conforme você acumula notas, algumas viram "índices" — listas de \`[[]]\` sobre um tema. Isso é um **MOC** (Map of Content).

Ex: uma nota chamada \`MOC — Produtividade\` que só tem wikilinks pras notas mais importantes sobre o tema. Você escreve essa nota aos poucos, ela cresce com você.

MOCs são o jeito Obsidian de criar hierarquia sem pastas.

---

Pronto. Você sabe tudo que precisa saber pra começar. O resto você aprende escrevendo.

Anterior: [[4. Abas do app]]
`,
  },
]

// ── Initial templates ────────────────────────────────────────────────────────

const TEMPLATES_INICIAIS = [
  {
    filename: 'Nota diária.md',
    body: `# {{date}}

## Como me sinto

## O que fiz hoje

-

## O que aprendi

## Amanhã

- [ ]
`,
  },
  {
    filename: 'Nota de leitura.md',
    body: `# {{Title}}

**Autor:**
**Fonte:** (livro, artigo, vídeo, podcast)
**Data:** {{date}}

## Resumo em 1 frase

## Highlights

>

## Minhas ideias

## Conecta com

- [[]]
`,
  },
]

// ── Machine Claude guide ─────────────────────────────────────────────────────

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

O Claude vê a pasta \`_machine/\` (onde você tá agora) mas **também** vê todas as suas notas humanas. Ele escreve em \`_machine/\` por padrão pra não bagunçar seu vault — você pode mover depois se quiser.

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
    `caderno: ${JSON.stringify(caderno)}`,
    `tags: []`,
    `criadaEm: ${now}`,
    `editadaEm: ${now}`,
    '---',
    '',
  ].join('\n')
  const filePath = await el().joinPath(vaultPath, caderno, filename + '.md')
  await el().writeFile(filePath, yaml + body)
}

// ── initVault ────────────────────────────────────────────────────────────────

export async function initVault(vaultPath) {
  await el().mkdir(await el().joinPath(vaultPath, 'meses'))
  await el().mkdir(await el().joinPath(vaultPath, getTemplatesDir()))

  const cadernos = await getNotebooks(vaultPath)

  try {
    const allPaths = await _getAllMdPaths(vaultPath).catch(() => [])

    if (allPaths.length === 0 && cadernos.length > 0) {
      const inboxExists = cadernos.find(c => c.nome === 'Inbox')
      const cadernoAlvo = inboxExists ? 'Inbox' : cadernos[0].nome
      for (const nota of ONBOARDING_NOTAS) {
        await _writeOnboardingNote(vaultPath, cadernoAlvo, nota.filename, nota.body)
      }

      for (const tpl of TEMPLATES_INICIAIS) {
        const tplPath = await el().joinPath(vaultPath, getTemplatesDir(), tpl.filename)
        const exists = await el().exists(tplPath)
        if (!exists) await el().writeFile(tplPath, tpl.body)
      }

      try {
        const machineDir = await el().joinPath(vaultPath, '_machine')
        await el().mkdir(machineDir)

        const claudeGuidePath = await el().joinPath(machineDir, 'Como usar Claude.md')
        if (!(await el().exists(claudeGuidePath))) {
          await el().writeFile(claudeGuidePath, MACHINE_CLAUDE_GUIDE)
        }
      } catch (err) {
        console.warn('[initVault] Falha ao popular _machine:', err?.message)
      }

      try {
        const currentDefault = await el().getConfig?.('defaultCaderno')
        if (!currentDefault) await el().setConfig?.('defaultCaderno', 'Inbox')

        const currentJournal = await el().getConfig?.('journalCaderno')
        if (!currentJournal) await el().setConfig?.('journalCaderno', 'Diário')
      } catch (err) {
        console.warn('[initVault] Falha ao setar configs default:', err?.message)
      }
    }
  } catch (err) {
    console.warn('[initVault] Falha no onboarding:', err?.message)
  }
}
