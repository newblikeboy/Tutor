import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import '../styles/legal-document.css'

// The operator-supplied document is rendered as text and semantic elements;
// authored markup is never inserted as HTML.
type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'separator' }
export type LegalDocumentContent = {
  title: string
  introduction: Block[]
  sections: { id: string; title: string; blocks: Block[] }[]
}

function Emphasis({ text }: { text: string }) {
  return text
    .split(/(\*\*[^*]+\*\*|https:\/\/gocoaching\.in\/(?:privacy-policy|terms-of-service)\b)/g)
    .map((part, index) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part === 'https://gocoaching.in/privacy-policy' ||
        part === 'https://gocoaching.in/terms-of-service' ? (
        <Link key={index} to={new URL(part).pathname}>
          {part}
        </Link>
      ) : (
        part
      ),
    )
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return blocks.map((block, index) => {
    if (block.type === 'separator') return <hr key={index} />
    if (block.type === 'heading')
      return (
        <h3 key={index}>
          <Emphasis text={block.text} />
        </h3>
      )
    if (block.type === 'paragraph')
      return (
        <p key={index}>
          <Emphasis text={block.text} />
        </p>
      )
    const List = block.ordered ? 'ol' : 'ul'
    return (
      <List key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>
            <Emphasis text={item} />
          </li>
        ))}
      </List>
    )
  })
}

function Contents({ sections }: { sections: LegalDocumentContent['sections'] }) {
  return (
    <ol>
      {sections.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`}>{section.title}</a>
        </li>
      ))}
    </ol>
  )
}

export function LegalDocument({
  content: policy,
  canonicalPath,
  description: metaDescription,
}: {
  content: LegalDocumentContent
  canonicalPath: string
  description: string
}) {
  useEffect(() => {
    const previousTitle = document.title
    const existingCanonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const canonical = existingCanonical ?? document.createElement('link')
    const previousHref = existingCanonical?.getAttribute('href')
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescription = description?.content
    document.title = `${policy.title} · GoCoaching`
    canonical.rel = 'canonical'
    canonical.href = `https://gocoaching.in${canonicalPath}`
    if (!existingCanonical) document.head.append(canonical)
    if (description) description.content = metaDescription
    return () => {
      document.title = previousTitle
      if (!existingCanonical) canonical.remove()
      else if (previousHref !== null && previousHref !== undefined)
        canonical.setAttribute('href', previousHref)
      else canonical.removeAttribute('href')
      if (description && previousDescription !== undefined)
        description.content = previousDescription
    }
  }, [policy.title, canonicalPath, metaDescription])

  return (
    <div className="container section legal-page">
      <header className="legal-heading">
        <h1>{policy.title}</h1>
        <div className="legal-metadata">
          <Blocks blocks={policy.introduction} />
        </div>
      </header>
      <div className="legal-layout">
        <aside className="legal-toc">
          <nav aria-label={`${policy.title} sections`} className="legal-desktop-toc">
            <h2>On this page</h2>
            <Contents sections={policy.sections} />
          </nav>
          <details className="legal-mobile-toc">
            <summary>On this page</summary>
            <nav aria-label={`${policy.title} sections`}>
              <Contents sections={policy.sections} />
            </nav>
          </details>
        </aside>
        <article className="legal-document" aria-label={`GoCoaching ${policy.title}`}>
          {policy.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id}>
              <h2 id={section.id} tabIndex={-1}>
                {section.title}
              </h2>
              <Blocks blocks={section.blocks} />
            </section>
          ))}
          <Link className="text-link" to="/support">
            Help & support
          </Link>
        </article>
      </div>
    </div>
  )
}
