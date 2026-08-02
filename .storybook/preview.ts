import type { Preview } from "@storybook/react";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    // E02/F10-04 — regras de contraste WCAG AA no painel Accessibility.
    a11y: {
      config: {
        rules: [
          { id: 'color-contrast', enabled: true },
          { id: 'color-contrast-enhanced', enabled: false },
        ],
      },
      test: 'error',
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0a0a0a' },
        { name: 'muted', value: '#f3f4f6' },
      ],
    },
  },
};

export default preview;
