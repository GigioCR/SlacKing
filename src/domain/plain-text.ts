// Summaries are markdown; notifications and the inbox's two-line previews are plain text. This
// keeps the words and drops the syntax, so "**Fixed** the `sync`" reads "Fixed the sync".

export function markdownToPlainText(markdown: string): string {
  return (
    markdown
      .replace(/\r\n/g, '\n')
      // Fences: keep the code, drop the ``` lines.
      .replace(/^\s*(```|~~~).*$/gm, '')
      // Table separators (|---|:--:|), then cells joined with " · ".
      .replace(/^(?=[^\n]*\|)(?=[^\n]*-)[ \t|:-]+(?:\n|$)/gm, '')
      .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, cells: string) =>
        cells
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean)
          .join(' · '),
      )
      // Images and links keep their text.
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Headings, quotes and list markers at the start of a line.
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/gm, '$1')
      .replace(/^(\s*)[-*+]\s+/gm, '$1• ')
      // Emphasis and code. Underscores only as whole-word markers, so snake_case stays.
      .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
      .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2')
      .replace(/(^|\W)_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
      .replace(/`([^`\n]+)`/g, '$1')
      // Horizontal rules, then the blank lines all of the above can leave.
      .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}
