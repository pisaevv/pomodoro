// Convert a CSS declaration string ("color:red;padding:4px") into a React style
// object. Lets us port the dc-runtime inline style strings verbatim instead of
// hand-translating every one. CSS custom properties (--x) are kept as-is;
// everything else (incl. vendor prefixes like -webkit-*) is camelCased.
function camel(prop) {
  if (prop.startsWith('--')) return prop
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

export function css(str) {
  const out = {}
  if (!str) return out
  for (const decl of str.split(';')) {
    const i = decl.indexOf(':')
    if (i === -1) continue
    const prop = decl.slice(0, i).trim()
    if (!prop) continue
    out[camel(prop)] = decl.slice(i + 1).trim()
  }
  return out
}
