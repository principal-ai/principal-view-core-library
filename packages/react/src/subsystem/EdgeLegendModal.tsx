/**
 * EdgeLegendModal — modal over the graph area showing the edge-mechanism
 * legend (moved out of the sidebar), plus the canonical mechanism
 * descriptions table shared with the canvas's edge-label overlay.
 */

import { useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { X } from 'lucide-react';
import { MECHANISM_COLOR, type SubsystemEdgeMechanism } from './model';

/** Mechanism → [description, verifiable-with-graphify]. Drives the legend
 *  modal and the "not directly verifiable" styling of edge labels. */
export const MECHANISM_DESCRIPTIONS: [SubsystemEdgeMechanism, string, boolean][] = [
  ['imports', 'import statement (code-level dependency)', true],
  ['imports_from', 'imported by (reverse dependency)', true],
  ['re_exports', 're-exports symbols from', true],
  ['defines', 'defines / declares symbol', true],
  ['calls', 'function/method call (call graph edge)', true],
  ['extends', 'class inheritance', true],
  ['inherits', 'class inheritance', true],
  ['implements', 'implements interface / protocol', true],
  ['mixes_in', 'applies mixin', true],
  ['uses', 'general dependency (import, call, or reference)', false],
  ['method', 'structural: has method / member', true],
  ['references', 'type / symbol reference (not a call)', true],
  ['contains', 'structural: contains / encapsulates', true],
  ['feeds', 'data flow: output feeds into input', false],
  ['produces', 'data flow: produces / outputs', false],
  ['registers-into', 'registration pattern', false],
];

/** Modal over the graph area showing the edge-mechanism legend (moved out of
 *  the sidebar). Closes on backdrop click or Escape; renders nothing when
 *  closed. */
export function EdgeLegendModal({
  open,
  mechanisms,
  onClose,
}: {
  open: boolean;
  mechanisms: Set<string>;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.colors.background,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          padding: '16px',
          width: 420,
          maxWidth: '90%',
          maxHeight: '80%',
          overflowY: 'auto',
          fontFamily: theme.fonts.body,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <span
            style={{
              fontSize: theme.fontSizes[1],
              fontWeight: 600,
              color: theme.colors.text,
            }}
          >
            Edge Legend
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close legend"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              padding: 0,
              border: 'none',
              borderRadius: 4,
              background: 'transparent',
              color: theme.colors.text,
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MECHANISM_DESCRIPTIONS.filter(([m]) => mechanisms.has(m)).map(([mechanism, desc, verifiable]) => (
            <div key={mechanism} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: theme.fontSizes[0] }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: verifiable ? '50%' : '30% 70% 70% 30% / 30% 30% 70% 70%',
                  background: MECHANISM_COLOR[mechanism],
                  border: verifiable ? 'none' : `1px dashed ${MECHANISM_COLOR[mechanism]}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontFamily: theme.fonts.monospace, color: MECHANISM_COLOR[mechanism], fontWeight: 500 }}>{mechanism}</span>
              <span style={{ color: muted }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
