import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button';
import { Mail, ArrowRight, Plus, Trash2, Check, Github } from 'lucide-react';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'destructive',
        'outline',
        'secondary',
        'ghost',
        'link',
        'whatsapp',
        'glowPurple',
        'glowGradient',
        'neon',
        'neonOutline',
        'success',
      ],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'xl', 'icon', 'icon-sm', 'icon-lg'],
    },
    isLoading: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: {
    children: 'Button',
    variant: 'default',
    size: 'default',
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="success">Success</Button>
      <Button variant="whatsapp">WhatsApp</Button>
      <Button variant="link">Link Variant</Button>
    </div>
  ),
};

export const SpecialVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 rounded-xl bg-slate-900 p-8">
      <Button variant="glowPurple">Glow Purple</Button>
      <Button variant="glowGradient">Glow Gradient</Button>
      <Button variant="neon">Neon</Button>
      <Button variant="neonOutline">Neon Outline</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button size="sm">Small</Button>
        <Button size="default">Default</Button>
        <Button size="lg">Large</Button>
        <Button size="xl">Extra Large</Button>
      </div>
      <div className="flex items-center gap-4">
        <Button size="icon-sm">
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="icon">
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="icon-lg">
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </div>
  ),
};

export const LoadingStates: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button isLoading>Processing</Button>
      <Button variant="outline" isLoading>
        Loading
      </Button>
      <Button variant="secondary" isLoading loadingText="Saving...">
        Save
      </Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button>
        <Mail className="mr-2 h-4 w-4" /> Login with Email
      </Button>
      <Button variant="secondary">
        <Github className="mr-2 h-4 w-4" /> GitHub
      </Button>
      <Button variant="outline">
        Next Step <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
      <Button variant="success">
        <Check className="mr-2 h-4 w-4" /> Completed
      </Button>
      <Button variant="destructive">
        <Trash2 className="mr-2 h-4 w-4" /> Delete
      </Button>
    </div>
  ),
};
