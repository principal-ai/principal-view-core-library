import React, { useState } from 'react';
import type { NodeState, NodeTypeDefinition } from '@principal-ai/principal-view-core/browser';
import { useTheme } from '@principal-ade/industry-theme';
import { resolveIcon } from '../utils/iconResolver';

// Common icons for the icon selector
const COMMON_ICONS = [
  'Settings',
  'Database',
  'Package',
  'Server',
  'Cloud',
  'Globe',
  'File',
  'Folder',
  'Code',
  'Terminal',
  'Cpu',
  'HardDrive',
  'Network',
  'Wifi',
  'Lock',
  'Unlock',
  'Key',
  'Shield',
  'User',
  'Users',
  'Mail',
  'MessageSquare',
  'Bell',
  'Calendar',
  'Clock',
  'Timer',
  'Zap',
  'Activity',
  'BarChart',
  'PieChart',
  'CheckCircle',
  'XCircle',
  'AlertCircle',
  'Info',
  'HelpCircle',
  'Play',
  'Pause',
  'Square',
  'Circle',
  'Triangle',
  'Hexagon',
  'Box',
  'Layers',
  'GitBranch',
  'GitCommit',
  'GitMerge',
  'GitPullRequest',
];

export interface NodeInfoPanelProps {
  node: NodeState;
  typeDefinition: NodeTypeDefinition;
  /** Available node types for the type selector */
  availableNodeTypes?: Record<string, NodeTypeDefinition>;
  onClose: () => void;
  /** Optional callback to delete the node. If not provided, delete button is hidden. */
  onDelete?: (nodeId: string) => void;
  /** Optional callback to update the node. If not provided, edit fields are disabled. */
  onUpdate?: (nodeId: string, updates: { type?: string; data?: Record<string, unknown> }) => void;
  /** Optional callback when a source is clicked. Receives the node ID and source path. */
  onSourceClick?: (nodeId: string, source: string) => void;
}

/**
 * Panel that displays information about a selected node with optional editing
 */
export const NodeInfoPanel: React.FC<NodeInfoPanelProps> = ({
  node,
  typeDefinition,
  availableNodeTypes,
  onClose,
  onDelete,
  onUpdate,
  onSourceClick,
}) => {
  const { theme } = useTheme();

  // Color priority: node data color > type definition color > theme primary
  const nodeColor = (node.data?.color as string) || typeDefinition?.color || theme.colors.primary;
  const canEdit = Boolean(onUpdate);

  // Local state for UI
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Current icon - either from node data override or type definition
  const currentIcon = (node.data?.icon as string) || typeDefinition?.icon;

  // Find the name field from data schema
  const nameField = typeDefinition?.dataSchema
    ? Object.entries(typeDefinition.dataSchema).find(([, schema]) => schema.displayInLabel)?.[0]
    : null;

  // Get fields to display based on dataSchema
  const displayFields = typeDefinition?.dataSchema
    ? Object.entries(typeDefinition.dataSchema)
        .filter(([, schema]) => schema.displayInLabel)
        .map(([field]) => ({
          field,
          label: field,
          value: node.data?.[field],
        }))
    : [];

  // Always show basic node data if no schema is defined
  const hasSchemaFields = displayFields.length > 0;
  // Internal fields that should not be displayed in the popup
  const internalFields = [
    'icon',
    'name',
    'description',
    'sources',
    'color',
    'stroke',
    'width',
    'height',
    'canvasType',
    'text',
    'file',
    'url',
    'shape',
    'states',
    'actions',
    'nodeType',
    'otel',
    'resourceMatch',
  ];

  // Extract OTEL metadata
  const otelInfo = node.data?.otel as
    | { kind?: string; category?: string; isNew?: boolean }
    | undefined;

  const nodeDataEntries = node.data
    ? Object.entries(node.data).filter(([key]) => !internalFields.includes(key))
    : [];

  // Get sources from node data
  const sources = (node.data?.sources as string[]) || [];

  const handleTypeChange = (newType: string) => {
    if (onUpdate && newType !== node.type) {
      onUpdate(node.id, { type: newType });
    }
  };

  const handleIconSelect = (iconName: string) => {
    if (onUpdate) {
      onUpdate(node.id, {
        data: { ...node.data, icon: iconName },
      });
    }
    setShowIconPicker(false);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '60px',
        right: '20px',
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '16px',
        minWidth: '250px',
        maxWidth: '350px',
        zIndex: 1000,
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      {/* Header - shows node name */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: `2px solid ${nodeColor}`,
        }}
      >
        <div style={{ fontWeight: 'bold', fontSize: '14px', color: nodeColor }}>
          {node.name || node.id}
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: theme.colors.textSecondary,
            padding: '0',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>
      </div>

      {/* Description - first field under header */}
      {node.data?.description && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', color: theme.colors.textSecondary, marginBottom: '4px' }}>
            Description
          </div>
          <div style={{ fontSize: '12px' }}>{String(node.data.description)}</div>
        </div>
      )}

      {/* Sources - shown after description */}
      {sources.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', color: theme.colors.textSecondary, marginBottom: '4px' }}>
            Sources
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {sources.map((source, index) =>
              onSourceClick ? (
                <button
                  key={index}
                  onClick={() => onSourceClick(node.id, source)}
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    backgroundColor: theme.colors.muted,
                    borderRadius: '4px',
                    color: theme.colors.textSecondary,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.colors.primary;
                    e.currentTarget.style.color = theme.colors.background;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme.colors.muted;
                    e.currentTarget.style.color = theme.colors.textSecondary;
                  }}
                >
                  {source}
                </button>
              ) : (
                <span
                  key={index}
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    backgroundColor: theme.colors.muted,
                    borderRadius: '4px',
                    color: theme.colors.textSecondary,
                  }}
                >
                  {source}
                </span>
              )
            )}
          </div>
        </div>
      )}

      {/* OTEL Info - shown after sources */}
      {otelInfo && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', color: theme.colors.textSecondary, marginBottom: '4px' }}>
            OpenTelemetry
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {/* Kind badge */}
            {otelInfo.kind && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '4px',
                  textTransform: 'uppercase',
                  color: 'white',
                  backgroundColor:
                    otelInfo.kind === 'type'
                      ? '#4A90E2'
                      : otelInfo.kind === 'service'
                      ? '#7ED321'
                      : otelInfo.kind === 'instance'
                      ? '#9B59B6'
                      : '#888',
                }}
              >
                {otelInfo.kind}
              </span>
            )}
            {/* Category */}
            {otelInfo.category && (
              <span
                style={{
                  fontSize: '11px',
                  color: theme.colors.textSecondary,
                }}
              >
                {otelInfo.category}
              </span>
            )}
            {/* NEW badge */}
            {otelInfo.isNew && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: '3px',
                  backgroundColor: '#F5A623',
                  color: 'white',
                }}
              >
                NEW
              </span>
            )}
          </div>
        </div>
      )}

      {/* Expand/Collapse button for additional details */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        style={{
          width: '100%',
          padding: '8px',
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          color: theme.colors.textSecondary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          marginBottom: showDetails ? '12px' : '0',
        }}
      >
        <span
          style={{
            transform: showDetails ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </span>
        {showDetails ? 'Hide Details' : 'Show Details'}
      </button>

      {/* Expandable details section */}
      {showDetails && (
        <>
          {/* Icon Selector */}
          <div style={{ marginBottom: '12px' }}>
            <div
              style={{ fontSize: '10px', color: theme.colors.textSecondary, marginBottom: '4px' }}
            >
              Icon
            </div>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => canEdit && setShowIconPicker(!showIconPicker)}
                disabled={!canEdit}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  backgroundColor: theme.colors.surface,
                  border: canEdit
                    ? `1px dashed ${theme.colors.border}`
                    : `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                  cursor: canEdit ? 'pointer' : 'default',
                  fontSize: '12px',
                  width: '100%',
                  justifyContent: 'flex-start',
                  color: theme.colors.text,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  {resolveIcon(currentIcon, 18)}
                </span>
                <span>{currentIcon || 'No icon'}</span>
                {canEdit && (
                  <span
                    style={{ marginLeft: 'auto', color: theme.colors.textMuted, fontSize: '10px' }}
                  >
                    ✎
                  </span>
                )}
              </button>

              {/* Icon Picker Dropdown */}
              {showIconPicker && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    backgroundColor: theme.colors.background,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '4px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    padding: '8px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    zIndex: 1001,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, 1fr)',
                      gap: '4px',
                    }}
                  >
                    {COMMON_ICONS.map((iconName) => (
                      <button
                        key={iconName}
                        onClick={() => handleIconSelect(iconName)}
                        title={iconName}
                        style={{
                          padding: '6px',
                          border:
                            currentIcon === iconName
                              ? `2px solid ${nodeColor}`
                              : `1px solid ${theme.colors.border}`,
                          borderRadius: '4px',
                          backgroundColor:
                            currentIcon === iconName
                              ? theme.colors.highlight
                              : theme.colors.background,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: theme.colors.text,
                        }}
                      >
                        {resolveIcon(iconName, 16)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Node Type - Editable if availableNodeTypes provided */}
          <div style={{ marginBottom: '12px' }}>
            <div
              style={{ fontSize: '10px', color: theme.colors.textSecondary, marginBottom: '4px' }}
            >
              Type
            </div>
            {canEdit && availableNodeTypes && Object.keys(availableNodeTypes).length > 1 ? (
              <select
                value={node.type}
                onChange={(e) => handleTypeChange(e.target.value)}
                style={{
                  fontSize: '12px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${theme.colors.border}`,
                  backgroundColor: theme.colors.background,
                  color: theme.colors.text,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {Object.entries(availableNodeTypes).map(([typeName, typeDef]) => (
                  <option key={typeName} value={typeName}>
                    {typeName} ({typeDef.shape})
                  </option>
                ))}
              </select>
            ) : (
              <div
                style={{
                  fontSize: '12px',
                  padding: '4px 8px',
                  backgroundColor: nodeColor,
                  color: theme.colors.background,
                  borderRadius: '4px',
                  display: 'inline-block',
                }}
              >
                {node.type}
              </div>
            )}
          </div>

          {/* Node State */}
          {node.state && (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{ fontSize: '10px', color: theme.colors.textSecondary, marginBottom: '4px' }}
              >
                State
              </div>
              <div
                style={{
                  fontSize: '12px',
                  padding: '4px 8px',
                  backgroundColor:
                    typeDefinition?.states?.[node.state]?.color || theme.colors.secondary,
                  color: theme.colors.background,
                  borderRadius: '4px',
                  display: 'inline-block',
                }}
              >
                {typeDefinition?.states?.[node.state]?.label || node.state}
              </div>
            </div>
          )}

          {/* Display other schema-defined fields (non-editable for now) */}
          {hasSchemaFields && displayFields.filter((f) => f.field !== nameField).length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  fontSize: '10px',
                  color: theme.colors.textSecondary,
                  marginBottom: '8px',
                  fontWeight: 'bold',
                }}
              >
                Properties
              </div>
              {displayFields
                .filter((f) => f.field !== nameField)
                .map(({ field, label, value }) => (
                  <div key={field} style={{ marginBottom: '8px' }}>
                    <div
                      style={{
                        fontSize: '10px',
                        color: theme.colors.textSecondary,
                        marginBottom: '2px',
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      {value !== undefined && value !== null
                        ? typeof value === 'object'
                          ? JSON.stringify(value, null, 2)
                          : String(value)
                        : '-'}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Show all node data if no schema is defined */}
          {!hasSchemaFields && nodeDataEntries.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div
                style={{
                  fontSize: '10px',
                  color: theme.colors.textSecondary,
                  marginBottom: '8px',
                  fontWeight: 'bold',
                }}
              >
                Data
              </div>
              {nodeDataEntries.map(([key, value]) => (
                <div key={key} style={{ marginBottom: '8px' }}>
                  <div
                    style={{
                      fontSize: '10px',
                      color: theme.colors.textSecondary,
                      marginBottom: '2px',
                    }}
                  >
                    {key}
                  </div>
                  <div style={{ fontSize: '12px', wordBreak: 'break-word' }}>
                    {value !== undefined && value !== null
                      ? typeof value === 'object'
                        ? JSON.stringify(value, null, 2)
                        : String(value)
                      : '-'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Metadata */}
          <div
            style={{
              fontSize: '10px',
              color: theme.colors.textMuted,
              marginTop: '12px',
              paddingTop: '8px',
              borderTop: `1px solid ${theme.colors.border}`,
            }}
          >
            ID: {node.id}
          </div>
        </>
      )}

      {/* Delete Button */}
      {onDelete && (
        <button
          onClick={() => {
            onDelete(node.id);
            onClose();
          }}
          style={{
            marginTop: '12px',
            width: '100%',
            padding: '8px 12px',
            backgroundColor: theme.colors.error,
            color: theme.colors.background,
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
          }}
        >
          Delete Node
        </button>
      )}
    </div>
  );
};
