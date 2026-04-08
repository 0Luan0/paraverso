/**
 * fuzzyMatch.js — Simple fuzzy matching for search and autocomplete.
 *
 * Scoring: prefix match (2) > substring match (1) > fuzzy subsequence (0.5) > no match (0)
 * All comparisons are case-insensitive.
 */

export function fuzzyMatch(text, query) {
  if (!text || !query) return { match: false, score: 0 }
  const t = text.toLowerCase()
  const q = query.toLowerCase()

  // Exact prefix match (highest score)
  if (t.startsWith(q)) return { match: true, score: 2 }

  // Substring match
  if (t.includes(q)) return { match: true, score: 1 }

  // Fuzzy subsequence match: every char in query appears in text in order
  let ti = 0
  for (let qi = 0; qi < q.length; qi++) {
    ti = t.indexOf(q[qi], ti)
    if (ti === -1) return { match: false, score: 0 }
    ti++
  }
  return { match: true, score: 0.5 }
}

/**
 * Filters and sorts an array by fuzzy match against a query.
 * Returns matched items sorted by score (highest first).
 *
 * @param {Array} items - Array of objects to search
 * @param {string} query - Search query
 * @param {function} getText - Function to extract searchable text from an item (can return string or array of strings)
 * @param {number} limit - Max results to return
 */
export function fuzzyFilter(items, query, getText, limit = 25) {
  if (!query.trim()) return items.slice(0, limit)

  const results = []
  for (const item of items) {
    const texts = getText(item)
    const fields = Array.isArray(texts) ? texts : [texts]
    let bestScore = 0
    for (const field of fields) {
      const { match, score } = fuzzyMatch(field, query)
      if (match && score > bestScore) bestScore = score
    }
    if (bestScore > 0) results.push({ item, score: bestScore })
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.item)
}
