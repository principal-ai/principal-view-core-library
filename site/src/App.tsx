import { Link, Route, Routes } from 'react-router-dom'
import './App.css'

function Home() {
  return (
    <section>
      <h1>principal-view-core-library</h1>
      <p>
        Project site for the Principal View core library monorepo, served from
        GitHub Pages.
      </p>
      <p>
        <Link to="/about">About this site →</Link>
      </p>
    </section>
  )
}

function About() {
  return (
    <section>
      <h1>About</h1>
      <p>
        This is a client-side route (<code>/about</code>). It works on refresh
        and deep links because the build copies <code>index.html</code> to{' '}
        <code>404.html</code>, letting the router take over for any path.
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
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </>
  )
}

export default App
