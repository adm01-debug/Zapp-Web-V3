import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  MotionCardComponent,
} from '../card';
import { Button } from '../button';
import { Badge } from '../badge';
import { User, Settings, Bell, Star } from 'lucide-react';

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'elevated',
        'interactive',
        'selected',
        'ghost',
        'glass',
        'neon',
        'gradient',
      ],
    },
    padding: {
      control: 'select',
      options: ['none', 'sm', 'default', 'lg'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-[350px]">
      <CardHeader>
        <CardTitle>Standard Card</CardTitle>
        <CardDescription>Using design system tokens for spacing and colors.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This content area follows the design system typography rules.
        </p>
      </CardContent>
      <CardFooter className="justify-between">
        <Button variant="ghost" size="sm">
          Cancel
        </Button>
        <Button size="sm">Continue</Button>
      </CardFooter>
    </Card>
  ),
};

export const VariantGallery: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-2">
      <Card variant="elevated">
        <CardHeader>
          <CardTitle className="text-lg">Elevated Card</CardTitle>
          <CardDescription>With shadow-md</CardDescription>
        </CardHeader>
        <CardContent>Uses tokens for depth and elevation.</CardContent>
      </Card>

      <Card variant="neon" className="bg-slate-950">
        <CardHeader>
          <CardTitle className="text-lg text-secondary">Neon Card</CardTitle>
          <CardDescription className="text-secondary/70">Modern cyberpunk style</CardDescription>
        </CardHeader>
        <CardContent className="text-secondary/90">Uses secondary color tokens.</CardContent>
      </Card>

      <Card
        variant="glass"
        className="border-white/10 bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-xl"
      >
        <CardHeader>
          <CardTitle className="text-lg">OLED Glass</CardTitle>
          <CardDescription>Blurred background</CardDescription>
        </CardHeader>
        <CardContent>Perfect for overlays and modern UIs.</CardContent>
      </Card>

      <Card variant="selected">
        <CardHeader>
          <CardTitle className="text-lg">Selected State</CardTitle>
          <CardDescription>Active component</CardDescription>
        </CardHeader>
        <CardContent>Highlights with primary color tokens.</CardContent>
      </Card>
    </div>
  ),
};

export const ProfileCard: Story = {
  render: () => (
    <Card className="w-[300px] overflow-hidden">
      <div className="h-24 bg-gradient-to-r from-primary to-secondary" />
      <div className="-mt-10 px-6 pb-6">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-muted">
          <User className="h-10 w-10 text-muted-foreground" />
        </div>
        <CardTitle>Jane Cooper</CardTitle>
        <CardDescription>Senior UI Designer</CardDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="secondary">Design</Badge>
          <Badge variant="outline">Figma</Badge>
          <Badge variant="outline">React</Badge>
        </div>
        <Button className="mt-6 w-full">View Profile</Button>
      </div>
    </Card>
  ),
};

export const MotionCard: Story = {
  render: () => (
    <div className="grid grid-cols-1 gap-6 p-4 md:grid-cols-3">
      <MotionCardComponent className="flex h-32 items-center justify-center">
        <div className="text-center">
          <Settings className="mx-auto mb-2 h-6 w-6 text-primary" />
          <span className="text-sm font-medium">Settings</span>
        </div>
      </MotionCardComponent>

      <MotionCardComponent className="flex h-32 items-center justify-center">
        <div className="text-center">
          <Bell className="mx-auto mb-2 h-6 w-6 text-primary" />
          <span className="text-sm font-medium">Notifications</span>
        </div>
      </MotionCardComponent>

      <MotionCardComponent className="flex h-32 items-center justify-center">
        <div className="text-center">
          <Star className="mx-auto mb-2 h-6 w-6 text-primary" />
          <span className="text-sm font-medium">Favorites</span>
        </div>
      </MotionCardComponent>
    </div>
  ),
};
