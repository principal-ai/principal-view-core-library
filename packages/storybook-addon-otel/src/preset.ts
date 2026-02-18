/**
 * Storybook preset - Entry point for addon registration
 */

export const managerEntries = (entries: string[] = []) => {
  return [...entries, '@principal-ai/storybook-addon-otel/manager'];
};

export { decorators } from './preview.js';
