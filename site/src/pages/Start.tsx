import { useState } from 'react'
import { Link } from 'react-router-dom'

const SKILL_PAGE =
  'https://skills.sh/principal-ai/principal-view-core-library/create-subsystem-model'
const SKILL_INSTALL =
  'npx skills add principal-ai/principal-view-core-library --skill create-subsystem-model'
const PROMPT_EXAMPLE =
  'Diagram the checkout subsystem in this repo as a Subsystem Model, then open it in Principal Studio.'

function CopyCommand({ command, label }: { command: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button type="button" className="command-pill" onClick={copy} aria-label={label ?? `Copy ${command}`}>
      <span className="command-dollar" aria-hidden>
        $
      </span>
      <code>{command}</code>
      <span className="command-copy">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  )
}

export function Start() {
  return (
    <section className="start-page">
      <header className="start-header">
        <h1>Try it yourself</h1>
        <p>
          Get the skill from skills.sh, then ask your coding agent to diagram a
          subsystem. The skill runs the CLI via <code>npx</code> — no separate
          CLI install. Principal Studio opens the result when available.
        </p>
      </header>

      <ol className="start-steps">
        <li className="start-step">
          <h2>
            <span className="start-step-num">1</span>
            Get the skill
          </h2>
          <p>
            Open it on skills.sh to review what it does, then install into your
            agent from there.
          </p>
          <div className="start-step-actions">
            <a
              className="button primary"
              href={SKILL_PAGE}
              target="_blank"
              rel="noreferrer"
            >
              View on skills.sh
            </a>
          </div>
          <p className="start-alt">Or install from the terminal:</p>
          <CopyCommand command={SKILL_INSTALL} label="Copy skill install command" />
        </li>

        <li className="start-step">
          <h2>
            <span className="start-step-num">2</span>
            Ask your agent
          </h2>
          <p>In a real repo, try a prompt like:</p>
          <blockquote className="start-prompt">{PROMPT_EXAMPLE}</blockquote>
        </li>
      </ol>

      <p className="start-next">
        Not sure what a good model looks like?{' '}
        <a href={`${import.meta.env.BASE_URL}examples/`}>See examples</a>
        {' · '}
        <Link to="/schema">Read the schema</Link>
        {' · '}
        <Link to="/about">Mission</Link>
      </p>
    </section>
  )
}
