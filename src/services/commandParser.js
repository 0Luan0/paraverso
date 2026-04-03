/**
 * commandParser.js — Parses \ commands and builds enriched prompts
 *
 * Commands start with \ followed by a template name from _machine/templates/.
 * Example: \pesquise sobre estoicismo
 *          \brainstorm criação de conteúdo
 *          \escreva um ensaio sobre liberdade
 */

import { loadContextForCommand, listMachineFiles } from './machineContext'

const el = () => window.electron

/**
 * Returns true if the input starts with \
 */
export function isCommand(input) {
  return typeof input === 'string' && input.startsWith('\\')
}

/**
 * Extracts command name and arguments from a \ command.
 * '\pesquise sobre estoicismo' → { command: 'pesquise', args: 'sobre estoicismo' }
 */
export function parseCommand(input) {
  const trimmed = input.replace(/^\\/, '').trim()
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) {
    return { command: trimmed, args: '' }
  }
  return {
    command: trimmed.slice(0, spaceIdx),
    args: trimmed.slice(spaceIdx + 1).trim(),
  }
}

/**
 * Returns list of available commands by reading _machine/templates/.
 * Each .md file becomes a command (filename without extension).
 */
// Built-in commands that don't need a template file
const BUILTIN_COMMANDS = ['pessoa', 'interesses', 'estilo', 'task']

export async function listCommands(vaultPath) {
  try {
    const files = await listMachineFiles(vaultPath)
    const templateCmds = files
      .filter(f => f.includes('/templates/') || f.includes('\\templates\\'))
      .map(f => f.split(/[/\\]/).pop().replace(/\.md$/i, ''))
      .filter(Boolean)
    return [...BUILTIN_COMMANDS, ...templateCmds]
  } catch {
    return [...BUILTIN_COMMANDS, 'pesquise', 'brainstorm', 'escreva']
  }
}

/**
 * Returns true if the command is a built-in (handled specially, not via template).
 */
export function isBuiltinCommand(command) {
  return BUILTIN_COMMANDS.includes(command)
}

/**
 * Builds a complete prompt by combining context files and user args.
 * Returns a string ready to be sent to Claude Code via pty.
 */
export function buildPrompt(command, args, contextFiles) {
  const { pessoa, interesses, template } = contextFiles
  const sections = []

  if (pessoa) {
    sections.push('[CONTEXTO DA PESSOA]', pessoa.trim(), '')
  }
  if (interesses) {
    sections.push('[INTERESSES E REFERÊNCIAS]', interesses.trim(), '')
  }
  if (template) {
    sections.push('[TEMPLATE DE COMPORTAMENTO]', template.trim(), '')
  }

  sections.push('[TAREFA]', args || `Execute o comando \\${command}`)

  return sections.join('\n')
}

/**
 * Full pipeline: parse command, load context, build prompt.
 * Returns { prompt, error } — if error is set, command was not found.
 */
export async function resolveCommand(rawInput, vaultPath) {
  if (!isCommand(rawInput)) {
    return { prompt: null, error: 'Not a command' }
  }

  const { command, args } = parseCommand(rawInput)

  // Load context files
  const machinePath = await el().joinPath(vaultPath, '_machine')
  const contextsPath = await el().joinPath(machinePath, 'contexts')
  const templatesPath = await el().joinPath(machinePath, 'templates')

  const templatePath = await el().joinPath(templatesPath, `${command}.md`)

  let pessoa = '', interesses = '', template = ''

  try { pessoa = await el().machineContext.readContext(await el().joinPath(contextsPath, 'pessoa.md')) } catch {}
  try { interesses = await el().machineContext.readContext(await el().joinPath(contextsPath, 'interesses.md')) } catch {}
  try { template = await el().machineContext.readContext(templatePath) } catch {}

  // If template doesn't exist or returned an error object, command is invalid
  if (!template || typeof template !== 'string' || template.error) {
    const available = await listCommands(vaultPath)
    return {
      prompt: null,
      error: `Comando \\${command} não encontrado. Disponíveis: ${available.map(c => '\\' + c).join(', ')}`,
    }
  }

  const prompt = buildPrompt(command, args, { pessoa, interesses, template })
  return { prompt, error: null }
}
