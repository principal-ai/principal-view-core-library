/**
 * Toolbar status indicator component
 * Shows current OTEL export status in Storybook toolbar
 */

import React, { useState, useCallback } from 'react';
import { useChannel, addons } from 'storybook/manager-api';
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

const Container = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

const TestButton = styled.button({
  background: 'transparent',
  border: '1px solid currentColor',
  borderRadius: '3px',
  padding: '2px 6px',
  fontSize: '10px',
  cursor: 'pointer',
  opacity: 0.8,
  '&:hover': {
    opacity: 1,
  },
  '&:disabled': {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
});

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

  const handleSendTestTrace = useCallback(() => {
    const channel = addons.getChannel();
    channel.emit(EVENTS.SEND_TEST_TRACE);
  }, []);

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

  const isActive = status.enabled && status.ready;

  return (
    <Container>
      <Button
        key={ADDON_ID}
        title={tooltipText}
        variant={isActive ? 'solid' : 'ghost'}
      >
        <StatusDot status={statusType} />
        OTEL
      </Button>
      <TestButton
        onClick={handleSendTestTrace}
        disabled={!isActive}
        title="Send a test trace to verify connection"
      >
        Test
      </TestButton>
    </Container>
  );
};
