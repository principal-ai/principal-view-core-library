/**
 * Manager entry point - Registers toolbar addon
 * Runs in the Storybook manager UI (outer frame)
 */

import React from 'react';
import { addons, types } from 'storybook/manager-api';
import { ADDON_ID } from './constants';
import { Tool } from './Tool';

// Register the toolbar addon
addons.register(ADDON_ID, () => {
  addons.add(ADDON_ID, {
    type: types.TOOL,
    title: 'OpenTelemetry Export',
    match: ({ viewMode }) => {
      // Show in story and docs view modes
      return !!(viewMode && viewMode.match(/^(story|docs)$/));
    },
    render: () => <Tool />,
  });
});
