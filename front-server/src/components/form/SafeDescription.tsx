import sanitizeHtml from 'sanitize-html'

// Permit simple colors only; CSS functions such as url() must never be passed through.
const color = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]{1,24}|rgba?\(\s*[\d.%\s,]+\)|hsla?\(\s*[\d.%\s,]+\))$/i
const imageData = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/]+={0,2}$/i

/** Keep common formatting while rejecting executable HTML, URLs and CSS. */
export function sanitizeDescription(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'div', 'span', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'title', 'target', 'rel', 'aria-label'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedStyles: { '*': { color: [color], 'background-color': [color] } },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, ...(attribs.target === '_blank' ? { rel: 'noopener noreferrer' } : {}) } }),
      img: (tagName, attribs) => {
        if (attribs.src && /^data:/i.test(attribs.src) && !imageData.test(attribs.src)) delete attribs.src
        return { tagName, attribs }
      },
    },
  })
}

export function SafeDescription({ html }: { html: string }) {
  return <div className="form-description" dangerouslySetInnerHTML={{ __html: sanitizeDescription(html) }} />
}
