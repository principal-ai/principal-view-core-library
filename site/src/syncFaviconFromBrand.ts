/** Sync the tab icon stroke to `--brand` from index.css. */
export function syncFaviconFromBrand() {
  const color =
    getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() ||
    '#4c6a91'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <circle cx="16" cy="16" r="13" stroke="${color}" stroke-width="2.5"/>
  <path d="M12 20 L20 12 M14.5 12 H20 V17.5" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    document.head.appendChild(link)
  }
  link.href = href
}
