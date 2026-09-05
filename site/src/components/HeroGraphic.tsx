const SUBSYSTEM_VIEW_JSON = `{
  "title": "Checkout",
  "components": [
    {
      "id": "checkout-api",
      "construct": "function", "symbol": "checkoutApi",
      "role": "entry", "purl": "pkg:github/you/your-app",
      "file": "src/checkout/api.ts"
    },
    {
      "id": "cart-store",
      "construct": "store", "symbol": "cartStore",
      "purl": "pkg:github/you/your-app",
      "file": "src/checkout/cartStore.ts"
    },
    {
      "id": "Stripe",
      "construct": "external", "role": "service",
      "purl": "external"
    },
    {
      "id": "Web client",
      "construct": "external", "purl": "external"
    }
  ],
  "edges": [
    {
      "id": "e0", "mechanism": "calls",
      "from": "Web client", "to": "checkout-api"
    },
    {
      "id": "e1", "mechanism": "writes",
      "from": "checkout-api", "to": "cart-store"
    },
    {
      "id": "e2", "mechanism": "calls",
      "from": "checkout-api", "to": "Stripe"
    }
  ]
}`

interface JsonPiece {
  text: string
  cls?: string
}

const JSON_TOKEN_RE =
  /"(?:[^"\\]|\\.)*"(\s*:)|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|\b(?:true|false|null)\b/g

function highlightJson(code: string): JsonPiece[] {
  const pieces: JsonPiece[] = []
  let last = 0
  for (const m of code.matchAll(JSON_TOKEN_RE)) {
    const idx = m.index
    if (idx > last) pieces.push({ text: code.slice(last, idx) })
    if (m[1]) {
      pieces.push({ text: m[0].slice(0, m[0].length - m[1].length), cls: 'j-key' })
      pieces.push({ text: m[1] })
    } else if (m[0].startsWith('"')) {
      pieces.push({ text: m[0], cls: 'j-str' })
    } else if (m[0] === 'true' || m[0] === 'false' || m[0] === 'null') {
      pieces.push({ text: m[0], cls: 'j-kw' })
    } else {
      pieces.push({ text: m[0], cls: 'j-num' })
    }
    last = idx + m[0].length
  }
  if (last < code.length) pieces.push({ text: code.slice(last) })
  return pieces
}

function ComponentGraphPreview() {
  return (
    <svg viewBox="0 0 460 270" role="img" aria-label="The Checkout Subsystem View rendered as a graph">
      <defs>
        <marker id="arrow-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f9e44" />
        </marker>
        <marker id="arrow-teal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#4ec9b0" />
        </marker>
      </defs>

      <rect x="95" y="0" width="105" height="56" rx="10" className="cg-card cg-card-external" />
      <text x="109" y="22" className="cg-name">Web client</text>
      <text x="109" y="44" className="cg-file">external</text>

      <path d="M 147 58 L 147 110" fill="none" stroke="#4ec9b0" strokeWidth="1.5" markerEnd="url(#arrow-teal)" />
      <text x="156" y="70" fill="#4ec9b0" className="cg-edge-label">calls</text>

      <rect x="25" y="78" width="245" height="192" rx="14" className="cg-region" />
      <text x="42" y="100" className="cg-region-label">YOUR-APP</text>

      <line x1="110" y1="178" x2="110" y2="192" stroke="#2f9e44" strokeWidth="1.5" markerEnd="url(#arrow-green)" />
      <text x="120" y="190" fill="#2f9e44" className="cg-edge-label">writes</text>

      <path d="M 250 146 C 288 146 292 172 326 172" fill="none" stroke="#4ec9b0" strokeWidth="1.5" markerEnd="url(#arrow-teal)" />
      <text x="298" y="160" textAnchor="middle" fill="#4ec9b0" className="cg-edge-label">calls</text>

      <rect x="48" y="114" width="200" height="64" rx="10" className="cg-card" />
      <text x="62" y="136" className="cg-name">checkoutApi</text>
      <text x="234" y="136" textAnchor="end" fill="#ff6b35" className="cg-badge">entry</text>
      <text x="62" y="158" className="cg-file">src/checkout/api.ts</text>

      <rect x="48" y="192" width="200" height="64" rx="10" className="cg-card" />
      <text x="62" y="214" className="cg-name">cartStore</text>
      <text x="234" y="214" textAnchor="end" fill="#2f9e44" className="cg-badge">store</text>
      <text x="62" y="236" className="cg-file">src/checkout/cartStore.ts</text>

      <rect x="330" y="140" width="105" height="64" rx="10" className="cg-card cg-card-external" />
      <text x="344" y="162" className="cg-name">Stripe</text>
      <text x="421" y="162" textAnchor="end" fill="#0893d2" className="cg-badge">service</text>
      <text x="344" y="184" className="cg-file">external</text>
    </svg>
  )
}

export function HeroGraphic() {
  const title = (JSON.parse(SUBSYSTEM_VIEW_JSON) as { title: string }).title
  return (
    <div className="graphic-window">
      <div className="graphic-titlebar">
        <div className="graphic-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <span className="graphic-filename">checkout.subsystem-view.json</span>
        <span className="graphic-badge">Subsystem View</span>
      </div>
      <div className="graphic-panes">
        <pre className="graphic-json">
          {highlightJson(SUBSYSTEM_VIEW_JSON).map((p, i) =>
            p.cls ? (
              <span key={i} className={p.cls}>
                {p.text}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </pre>
        <div className="graphic-graph">
          <div className="graphic-graph-title">{title}</div>
          <ComponentGraphPreview />
        </div>
      </div>
    </div>
  )
}
