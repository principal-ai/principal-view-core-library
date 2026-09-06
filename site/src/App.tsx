import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import './App.css'

const Schema = lazy(() =>
  import('./pages/Schema').then((m) => ({ default: m.Schema })),
)

const HeroGraphic = lazy(() =>
  import('./components/HeroGraphic').then((m) => ({ default: m.HeroGraphic })),
)

function Home() {
  return (
    <section className="hero">
      <div className="hero-copy">
        <h1>Verifiable System Diagrams</h1>
      </div>
      <div className="hero-art">
        <Suspense fallback={null}>
          <HeroGraphic />
        </Suspense>
      </div>
    </section>
  )
}

function About() {
  return (
    <section className="about">
      <h1>About</h1>
      <p>
        A Subsystem View is a JSON definition of a subsystem: construct-tagged components anchored
        to real source files, connected by typed edges, and carrying the throughlines the
        subsystem must support. Any renderer can draw it; Principal View anchors every component
        to its declaration so the view cannot silently drift from the code.
      </p>
      <p>
        This site is the landing page for the monorepo, served from GitHub Pages. This is a
        client-side route (<code>/about</code>); it works on refresh and deep links because the
        build copies <code>index.html</code> to <code>404.html</code>, letting the router take
        over for any path.
      </p>
      <p>
        <Link to="/">← Back home</Link>
      </p>
    </section>
  )
}

function App() {
  return (
    <>
      <nav>
        <Link to="/" className="brand">
          Subsystem Views
        </Link>
        <div className="nav-links">
          <Link to="/about">About</Link>
          <Link to="/schema">Schema</Link>
          <a href={`${import.meta.env.BASE_URL}examples/`}>Examples</a>
          <a href="https://github.com/principal-ai/principal-view" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/schema"
            element={
              <Suspense fallback={<section className="schema-page">Loading schema…</section>}>
                <Schema />
              </Suspense>
            }
          />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </>
  )
}

export default App
