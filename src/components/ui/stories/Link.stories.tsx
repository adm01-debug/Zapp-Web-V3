import type { Meta, StoryObj } from '@storybook/react-vite';
import { buttonVariants } from '../button';
import { cn } from '@/lib/utils';
import { ExternalLink, ArrowRight, Github } from 'lucide-react';

/**
 * Links in this design system use primary color tokens and follow strict typography rules.
 * We use both standard anchor tags and the Button component with `variant="link"`.
 */
const meta: Meta = {
  title: 'UI/Links',
  tags: ['autodocs'],
};

export default meta;

export const LinkGallery: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-8 p-4">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Standard Links</h3>
        <div className="flex flex-wrap items-center gap-6">
          <a
            href="#"
            className="font-medium text-primary underline-offset-4 transition-all hover:text-primary/80 hover:underline"
          >
            Primary Link
          </a>
          <a
            href="#"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Muted Utility Link
          </a>
          <a
            href="#"
            className="text-sm font-medium text-destructive underline-offset-4 transition-all hover:underline"
          >
            Destructive Link
          </a>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">With Icons</h3>
        <div className="flex flex-wrap items-center gap-6">
          <a
            href="#"
            className="flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
          >
            External Resource <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href="#"
            className="group flex items-center gap-1.5 text-foreground transition-colors hover:text-primary"
          >
            Learn More{' '}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </a>
          <a
            href="#"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Github className="h-4 w-4" /> View Source
          </a>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Button "Link" Variant</h3>
        <div className="flex flex-wrap items-center gap-6">
          <button className={cn(buttonVariants({ variant: 'link' }))}>
            Interactive Link Component
          </button>
          <button className={cn(buttonVariants({ variant: 'link', size: 'sm' }))}>
            Small Link
          </button>
          <button className={cn(buttonVariants({ variant: 'link' }), 'px-0')}>
            No Padding Link
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Navigation Links</h3>
        <nav className="flex items-center space-x-4 text-sm font-medium">
          <a href="#" className="text-primary">
            Overview
          </a>
          <a href="#" className="text-muted-foreground transition-colors hover:text-primary">
            Analytics
          </a>
          <a href="#" className="text-muted-foreground transition-colors hover:text-primary">
            Reports
          </a>
          <a href="#" className="text-muted-foreground transition-colors hover:text-primary">
            Settings
          </a>
        </nav>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Inline Context</h3>
        <div className="max-w-md rounded-lg border border-border bg-card p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            By accessing our platform, you acknowledge that you have read and understood our{' '}
            <a href="#" className="font-medium text-primary underline-offset-2 hover:underline">
              Terms of Use
            </a>{' '}
            and our{' '}
            <a href="#" className="font-medium text-primary underline-offset-2 hover:underline">
              Privacy Policy
            </a>
            . If you have any questions, please{' '}
            <a href="#" className="font-medium text-primary hover:underline">
              contact support
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  ),
};
