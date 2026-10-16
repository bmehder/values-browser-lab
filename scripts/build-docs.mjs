import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { Marked } from 'marked'
import path from 'node:path'

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const slug = text => text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\w\s-]/g, '').replace(/\s/g, '-')
await rm('docs/source', { recursive: true, force: true })
const sourceLinks = new Set()
const header = `<header class="topbar"><a class="brand" href="/">Valuz<span> / browser lab</span></a><div class="header-actions"><a class="docs-back" href="/">← Back to the app</a><a class="docs-back" href="https://github.com/bmehder/values-browser-lab">GitHub ↗</a></div></header>`
const tabs = current => `<nav class="docs-tabs" aria-label="Documentation"><a href="/docs/" ${current === 'guide' ? 'aria-current="page"' : ''}>Full guide</a><a href="/docs/reference.html" ${current === 'reference' ? 'aria-current="page"' : ''}>Quick reference</a></nav>`
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · Valuz Browser Lab</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/docs/docs.css"></head><body>${header}${body}</body></html>`

for (const [name, output, current] of [['guide.md', 'index.html', 'guide'], ['reference.md', 'reference.html', 'reference']]) {
  const headings = []
  const parser = new Marked({ gfm: true })
  parser.use({ renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens)
      const id = slug(text)
      if (depth === 2) headings.push({ text, id })
      return `<h${depth} id="${id}">${text}</h${depth}>\n`
    },
    link({ href, tokens, title }) {
      let target = href
      if (href === 'guide.md') target = '/docs/'
      if (href === 'reference.md') target = '/docs/reference.html'
      if (href.startsWith('../src/') || href === '../entry.mjs') {
        const relative = href.slice(3)
        sourceLinks.add(relative)
        target = `/docs/source/${relative}.html`
      }
      return `<a href="${escape(target)}"${title ? ` title="${escape(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`
    },
  } })
  const rendered = parser.parse(await readFile(`docs/${name}`, 'utf8'))
  const contents = headings.map(({ text, id }) => `<a href="#${id}">${text}</a>`).join('')
  await writeFile(`docs/${output}`, page(current === 'guide' ? 'Understanding the app' : 'Quick reference', `${tabs(current)}<div class="docs-layout"><aside class="docs-toc"><p>ON THIS PAGE</p><nav aria-label="On this page">${contents}</nav><a class="download-source" href="/docs/${name}" download>Download Markdown ↓</a></aside><main class="docs-content">${rendered}</main></div>`))
}

for (const source of sourceLinks) {
  const destination = `docs/source/${source}.html`
  await mkdir(path.dirname(destination), { recursive: true })
  const code = escape(await readFile(source, 'utf8'))
  await writeFile(destination, page(source, `${tabs('source')}<main class="docs-source"><p class="eyebrow">PROJECT SOURCE</p><h1>${escape(source)}</h1><p><a href="/docs/">← Return to the guide</a></p><pre><code>${code}</code></pre></main>`))
}
console.log(`Built guide, reference, and ${sourceLinks.size} readable source pages.`)
