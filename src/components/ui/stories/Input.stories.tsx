import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '../input';
import { Search, User, Mail, AlertCircle, CheckCircle, Lock, Eye, Calendar } from 'lucide-react';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'glow', 'neon', 'ghost', 'underline'],
    },
    inputSize: {
      control: 'select',
      options: ['sm', 'default', 'lg'],
    },
    error: { control: 'boolean' },
    success: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    placeholder: 'Type something...',
    variant: 'default',
  },
};

export const InputGallery: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Standard Input</label>
        <Input placeholder="Enter your name" />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Input with Icon</label>
        <Input placeholder="Search..." leftIcon={Search} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Glow Variant</label>
        <Input variant="glow" placeholder="Email address" leftIcon={Mail} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Neon Variant</label>
        <Input variant="neon" placeholder="Username" leftIcon={User} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Underline Variant</label>
        <Input variant="underline" placeholder="Search anything..." />
      </div>
    </div>
  ),
};

export const ValidationStates: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-6">
      <div className="space-y-2">
        <label className="text-sm font-medium text-destructive">Error State</label>
        <Input error defaultValue="invalid-email" rightIcon={AlertCircle} />
        <p className="text-xs text-destructive">Please enter a valid email address.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-success">Success State</label>
        <Input success defaultValue="valid_username" rightIcon={CheckCircle} />
        <p className="text-xs text-success">Username is available!</p>
      </div>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4">
      <Input inputSize="sm" placeholder="Small input" />
      <Input inputSize="default" placeholder="Default input" />
      <Input inputSize="lg" placeholder="Large input" />
    </div>
  ),
};

export const CommonUseCases: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Password</label>
        <Input type="password" placeholder="••••••••" leftIcon={Lock} rightIcon={Eye} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Date Picker</label>
        <Input type="date" leftIcon={Calendar} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Disabled</label>
        <Input disabled value="Read only content" leftIcon={Lock} />
      </div>
    </div>
  ),
};
