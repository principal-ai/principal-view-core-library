/**
 * SubsystemFileTree — read-only folder/file tree derived from the unique
 * source files of a subsystem's components. Rendered in the bottom half of
 * the SubsystemComponentGraph sidebar as a navigation aid.
 */

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

interface TreeEntry {
  name: string;
  path: string;
  isFile: boolean;
  children: Map<string, TreeEntry>;
}

/** Build a nested tree from repo-root-relative file paths (deduped). */
export function buildFileTree(files: string[]): TreeEntry {
  const root: TreeEntry = { name: '', path: '', isFile: false, children: new Map() };
  for (const file of [...new Set(files)].sort()) {
    const segments = file.split('/').filter(Boolean);
    let node = root;
    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      const path = node.path ? `${node.path}/${segment}` : segment;
      let child = node.children.get(segment);
      if (!child || child.isFile !== isFile) {
        child = { name: segment, path, isFile, children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    });
  }
  return root;
}

function sortEntries(node: TreeEntry): TreeEntry[] {
  return Array.from(node.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export interface SubsystemFileTreeProps {
  /** Repo-root-relative file paths; duplicates are deduped. */
  files: string[];
  /** File to highlight (e.g. the selected component's file). */
  selectedFile?: string | null;
  /** Called when a file row is clicked. */
  onSelectFile?: (file: string) => void;
}

/** Fills its parent height by design — pin it with a sized flex container. */
export function SubsystemFileTree({ files, selectedFile, onSelectFile }: SubsystemFileTreeProps) {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted ?? theme.colors.textSecondary;
  const root = useMemo(() => buildFileTree(files), [files]);
  const uniqueCount = useMemo(() => new Set(files).size, [files]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);

  const toggleFolder = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderEntries = (node: TreeEntry, depth: number): ReactNode[] =>
    sortEntries(node).map((child) => {
      if (child.isFile) {
        const isSelected = child.path === selectedFile;
        return (
          <button
            key={child.path}
            type="button"
            onClick={() => onSelectFile?.(child.path)}
            onMouseEnter={() => setHovered(child.path)}
            onMouseLeave={() => setHovered((prev) => (prev === child.path ? null : prev))}
            title={child.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              width: '100%',
              padding: '1px 6px',
              border: 'none',
              borderRadius: 4,
              background: isSelected || hovered === child.path
                ? theme.colors.border
                : 'transparent',
              color: theme.colors.text,
              fontWeight: isSelected ? 600 : 400,
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[0],
              lineHeight: '20px',
              textAlign: 'left',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ width: 12, flexShrink: 0 }} />
            <FileText size={11} style={{ flexShrink: 0, opacity: 0.8 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{child.name}</span>
          </button>
        );
      }
      const isCollapsed = collapsed.has(child.path);
      return (
        <div key={child.path}>
          <button
            type="button"
            onClick={() => toggleFolder(child.path)}
            onMouseEnter={() => setHovered(child.path)}
            onMouseLeave={() => setHovered((prev) => (prev === child.path ? null : prev))}
            title={child.path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              width: '100%',
              padding: '1px 6px',
              border: 'none',
              borderRadius: 4,
              background: hovered === child.path ? theme.colors.border : 'transparent',
              color: muted,
              fontFamily: theme.fonts.monospace,
              fontSize: theme.fontSizes[0],
              lineHeight: '20px',
              textAlign: 'left',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            <span style={{ width: 12, flexShrink: 0, display: 'inline-flex', justifyContent: 'center' }}>
              {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
            </span>
            {isCollapsed ? <Folder size={11} style={{ flexShrink: 0 }} /> : <FolderOpen size={11} style={{ flexShrink: 0 }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{child.name}</span>
          </button>
          {!isCollapsed && (
            <div style={{ paddingLeft: 12 }}>
              {renderEntries(child, depth + 1)}
            </div>
          )}
        </div>
      );
    });

  return (
    <div
      style={{
        height: '50%',
        minHeight: 120,
        flexShrink: 0,
        borderTop: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '10px 16px 4px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: theme.fontSizes[0] * 0.8,
            fontFamily: theme.fonts.monospace,
            textTransform: 'uppercase',
            color: muted,
            fontWeight: 600,
          }}
        >
          Files
        </span>
        <span style={{ fontSize: theme.fontSizes[0] * 0.8, fontFamily: theme.fonts.monospace, color: muted }}>
          {uniqueCount}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 8px' }}>
        {renderEntries(root, 0)}
      </div>
    </div>
  );
}
