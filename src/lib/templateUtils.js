/**
 * templateUtils.js — Template system utilities
 *
 * Templates are plain markdown files in the vault's templates/ folder.
 * Variables: {{date}}, {{time}}, {{Title}}, {{title}}
 */

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/**
 * Substitui variáveis de template no markdown.
 * Retorna markdown puro — sem conversão para HTML.
 */
export function resolverVariaveis(markdown, { titulo = '' } = {}) {
  if (!markdown) return ''
  const now = new Date()
  const dia = now.getDate()
  const mes = MESES_PT[now.getMonth()]
  const ano = now.getFullYear()
  const horas = String(now.getHours()).padStart(2, '0')
  const minutos = String(now.getMinutes()).padStart(2, '0')

  return markdown
    .replace(/\{\{date\}\}/gi, `${dia} ${mes} ${ano}`)
    .replace(/\{\{time\}\}/gi, `${horas}:${minutos}`)
    .replace(/\{\{Title\}\}/g, titulo ? `# ${titulo}` : '')
    .replace(/\{\{title\}\}/g, titulo || '')
}
