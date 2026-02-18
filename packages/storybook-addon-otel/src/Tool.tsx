/**
 * Toolbar status indicator component
 * Shows current OTEL export status in Storybook toolbar
 */

import React, { useState } from 'react';
import { useChannel } from 'storybook/manager-api';
import { Button } from 'storybook/internal/components';
import { styled } from 'storybook/theming';
import { EVENTS, ADDON_ID } from './constants';
import type { OtelExportStatus } from './types';

const StatusDot = styled.span<{ status: 'enabled' | 'disabled' | 'error' }>(
  ({ status }) => ({
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginRight: '6px',
    backgroundColor:
      status === 'enabled'
        ? '#22c55e' // green
        : status === 'error'
        ? '#ef4444' // red
        : '#6b7280', // gray
  })
);

export const Tool = () => {
  const [status, setStatus] = useState<OtelExportStatus>({
    ready: false,
    enabled: false,
    endpoint: 'http://localhost:4318/v1/traces',
    serviceName: 'storybook',
  });

  // Listen for status updates from preview
  useChannel({
    [EVENTS.STATUS_UPDATE]: (newStatus: OtelExportStatus) => {
      setStatus(newStatus);
    },
  });

  const statusType = status.error
    ? 'error'
    : status.enabled && status.ready
    ? 'enabled'
    : 'disabled';

  const statusText = status.error
    ? 'Error'
    : status.enabled
    ? status.ready
      ? 'Active'
      : 'Initializing...'
    : 'Disabled';

  const tooltipText = `Status: ${statusText}\nEndpoint: ${status.endpoint}\nService: ${status.serviceName}${status.error ? `\nError: ${status.error}` : ''}`;

  return (
    <Button
      key={ADDON_ID}
      title={tooltipText}
      variant={status.enabled && status.ready ? 'solid' : 'ghost'}
    >
      <StatusDot status={statusType} />
      OTEL
    </Button>
  );
};
