/**
 * Shared constants for the addon
 */

// Parameter namespace for addon configuration
export const PARAM_KEY = 'otelExport';

// Addon ID
export const ADDON_ID = 'storybook-addon-otel';

// Channel event names for communication between manager and preview
export const EVENTS = {
  STATUS_UPDATE: `${ADDON_ID}/status-update`,
  PROVIDER_READY: `${ADDON_ID}/provider-ready`,
  PROVIDER_ERROR: `${ADDON_ID}/provider-error`,
  SEND_TEST_TRACE: `${ADDON_ID}/send-test-trace`,
} as const;

// Storage keys
export const STORAGE_KEY = `${ADDON_ID}.config`;
