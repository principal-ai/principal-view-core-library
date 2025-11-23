import React from 'react';
import type { EdgeState, EdgeTypeDefinition } from '@principal-ai/visual-validation-core';

export interface EdgeInfoPanelProps {
  edge: EdgeState;
  typeDefinition: EdgeTypeDefinition;
  sourceNodeId: string;
  targetNodeId: string;
  onClose: () => void;
}

/**
 * Panel that displays information about a selected edge
 */
export const EdgeInfoPanel: React.FC<EdgeInfoPanelProps> = ({
  edge,
  typeDefinition,
  sourceNodeId,
  targetNodeId,
  onClose,
}) => {
  const color = typeDefinition.color || '#888';

  // Get fields to display based on dataSchema
  const displayFields = typeDefinition.dataSchema
    ? Object.entries(typeDefinition.dataSchema)
        .filter(([, schema]) => schema.displayInInfo)
        .map(([field, schema]) => ({
          field,
          label: schema.label || field,
          value: edge.data?.[field],
        }))
    : [];

  // Always show basic edge data if no schema is defined
  const hasSchemaFields = displayFields.length > 0;
  const edgeDataEntries = edge.data ? Object.entries(edge.data) : [];

  return (
    <div
      style={{
        position: 'absolute',
        top: '60px',
        right: '20px',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '16px',
        minWidth: '250px',
        maxWidth: '350px',
        zIndex: 1000,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: `2px solid ${color}`,
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
          Edge Information
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: '#666',
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

      {/* Edge Type */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>
          Type
        </div>
        <div style={{
          fontSize: '12px',
          padding: '4px 8px',
          backgroundColor: color,
          color: 'white',
          borderRadius: '4px',
          display: 'inline-block',
        }}>
          {edge.type}
        </div>
      </div>

      {/* Connection Info */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px' }}>
          Connection
        </div>
        <div style={{ fontSize: '12px', color: '#333' }}>
          <span style={{ fontFamily: 'monospace', backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>
            {sourceNodeId}
          </span>
          <span style={{ margin: '0 8px', color: '#888' }}>→</span>
          <span style={{ fontFamily: 'monospace', backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '3px' }}>
            {targetNodeId}
          </span>
        </div>
      </div>

      {/* Display schema-defined fields */}
      {hasSchemaFields && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>
            Properties
          </div>
          {displayFields.map(({ field, label, value }) => (
            <div key={field} style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>
                {label}
              </div>
              <div style={{ fontSize: '12px', color: '#333' }}>
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

      {/* Show all edge data if no schema is defined */}
      {!hasSchemaFields && edgeDataEntries.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>
            Data
          </div>
          {edgeDataEntries.map(([key, value]) => (
            <div key={key} style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px' }}>
                {key}
              </div>
              <div style={{ fontSize: '12px', color: '#333', wordBreak: 'break-word' }}>
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
      <div style={{ fontSize: '10px', color: '#999', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #eee' }}>
        ID: {edge.id}
      </div>
    </div>
  );
};
