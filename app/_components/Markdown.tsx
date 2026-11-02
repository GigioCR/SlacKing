'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Claude writes markdown: headings, lists, code, tables. Rendered without raw HTML (react-markdown
// skips it) and without images, which would load from addresses in the text. Links open outside
// the app; react-markdown already drops javascript: and other unsafe addresses.
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  // Wide tables scroll sideways instead of widening the page.
  table: ({ children }) => (
    <div className="markdown-table">
      <table>{children}</table>
    </div>
  ),
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={['img']} unwrapDisallowed skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}

/** Markdown that starts folded when it is long, with Show more / Show less. */
export function CollapsibleMarkdown({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(false)

  // Measured, not guessed from the length: a short text with a code block can still be tall.
  useLayoutEffect(() => {
    const el = box.current
    if (el) setLong(el.scrollHeight > el.clientHeight + 8)
  }, [text])

  return (
    <div className="collapsible">
      <div ref={box} className={open ? 'collapsible-body' : long ? 'collapsible-body folded faded' : 'collapsible-body folded'}>
        <Markdown text={text} />
      </div>
      {(long || open) && (
        <button type="button" className="show-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
