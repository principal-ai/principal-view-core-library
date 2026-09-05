import '@xyflow/react/dist/style.css';
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider, defaultEditorTheme } from '@principal-ade/industry-theme';
import { SubsystemComponentGraph } from '../src/subsystem/SubsystemComponentGraph';
import type { SubsystemComponent, SubsystemComponentEdge } from '../src/subsystem/model';

const components: SubsystemComponent[] = [
  {
    id: 'checkout-api',
    name: 'checkoutApi',
    construct: 'function',
    symbol: 'checkoutApi',
    role: 'entry',
    purl: 'pkg:github/you/your-app',
    file: 'src/checkout/api.ts',
    purpose: 'Handles cart requests.',
  },
  {
    id: 'cart-store',
    name: 'cartStore',
    construct: 'store',
    symbol: 'cartStore',
    purl: 'pkg:github/you/your-app',
    file: 'src/checkout/cartStore.ts',
    purpose: 'Retained cart state.',
  },
  {
    id: 'Stripe',
    name: 'Stripe',
    construct: 'external',
    role: 'service',
    file: '',
    purl: 'external',
  },
  {
    id: 'Web client',
    name: 'Web client',
    construct: 'external',
    file: '',
    purl: 'external',
  },
];

const edges: SubsystemComponentEdge[] = [
  { id: 'e0', from: 'Web client', to: 'checkout-api', mechanism: 'calls' },
  { id: 'e1', from: 'checkout-api', to: 'cart-store', mechanism: 'writes' },
  { id: 'e2', from: 'checkout-api', to: 'Stripe', mechanism: 'calls' },
];

function CheckoutDemo() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <SubsystemComponentGraph
        components={components}
        edges={edges}
        title="Checkout"
        description="A small e-commerce checkout subsystem: an HTTP entry point that writes to retained cart state and calls out to Stripe."
      />
    </div>
  );
}

const meta = {
  title: 'Examples/TypeScript/Checkout',
  component: SubsystemComponentGraph,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <ThemeProvider theme={defaultEditorTheme}>
        <Story />
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof SubsystemComponentGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checkout: Story = {
  render: () => <CheckoutDemo />,
};
