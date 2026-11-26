/** Minimal XML builder: elements, escaped text, no mixed content (all FatturaPA needs). */
export type XmlNode = { name: string; attrs?: Record<string, string>; children?: XmlNode[]; text?: string }

export function el(name: string, content?: string | XmlNode[] | null, attrs?: Record<string, string>): XmlNode {
  if (typeof content === 'string') return { name, text: content, attrs }
  return { name, children: content ?? [], attrs }
}

/** Optional element: omitted when the value is empty, null or undefined. */
export function opt(name: string, value: string | null | undefined): XmlNode[] {
  return value === undefined || value === null || value === '' ? [] : [el(name, value)]
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function serialize(node: XmlNode, indent = 0): string {
  const pad = '  '.repeat(indent)
  const attrs = Object.entries(node.attrs ?? {})
    .map(([k, v]) => ` ${k}="${escapeXml(v)}"`)
    .join('')
  if (node.text !== undefined) return `${pad}<${node.name}${attrs}>${escapeXml(node.text)}</${node.name}>`
  if (!node.children || node.children.length === 0) return `${pad}<${node.name}${attrs}/>`
  const inner = node.children.map((c) => serialize(c, indent + 1)).join('\n')
  return `${pad}<${node.name}${attrs}>\n${inner}\n${pad}</${node.name}>`
}
