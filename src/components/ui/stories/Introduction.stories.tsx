import type { Meta } from '@storybook/react-vite';
const meta: Meta = { title: 'Design System/Introduction' };
export default meta;
export const Tokens = {
  render: () => (
    <div className="max-w-4xl space-y-12 p-8">
      {' '}
      <section className="space-y-6">
        {' '}
        <h2 className="text-3xl font-bold tracking-tight">Color Palette</h2>{' '}
        <p className="text-muted-foreground">
          These are the core color tokens used throughout the application.
        </p>{' '}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {' '}
          <ColorBlock label="Primary" bg="bg-primary" text="text-primary-foreground" />{' '}
          <ColorBlock label="Secondary" bg="bg-secondary" text="text-secondary-foreground" />{' '}
          <ColorBlock label="Accent" bg="bg-accent" text="text-accent-foreground" />{' '}
          <ColorBlock label="Muted" bg="bg-muted" text="text-muted-foreground" />{' '}
          <ColorBlock label="Destructive" bg="bg-destructive" text="text-destructive-foreground" />{' '}
          <ColorBlock label="Success" bg="bg-success" text="text-success-foreground" />{' '}
          <ColorBlock
            label="Background"
            bg="bg-background"
            text="text-foreground"
            border="border"
          />{' '}
          <ColorBlock label="Card" bg="bg-card" text="text-card-foreground" border="border" />{' '}
          <ColorBlock
            label="Popver"
            bg="bg-popover"
            text="text-popover-foreground"
            border="border"
          />{' '}
        </div>{' '}
      </section>{' '}
      <section className="space-y-6">
        {' '}
        <h2 className="text-3xl font-bold tracking-tight">Typography</h2>{' '}
        <p className="text-muted-foreground">
          Standard text styles for consistent information hierarchy.
        </p>{' '}
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          {' '}
          <div className="space-y-1">
            {' '}
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Heading 1
            </span>{' '}
            <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl">
              Design System Heading
            </h1>{' '}
          </div>{' '}
          <div className="space-y-1">
            {' '}
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Heading 2
            </span>{' '}
            <h2 className="text-3xl font-semibold tracking-tight">Section Title</h2>{' '}
          </div>{' '}
          <div className="space-y-1">
            {' '}
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Heading 3
            </span>{' '}
            <h3 className="text-2xl font-semibold tracking-tight">Subsection Title</h3>{' '}
          </div>{' '}
          <div className="space-y-1">
            {' '}
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Body Text
            </span>{' '}
            <p className="leading-7 [&:not(:first-child)]:mt-6">
              {' '}
              The king, seeing how much the entire kingdom would benefit from a designer's touch,
              decreed that all interfaces shall be built with consistent tokens.{' '}
            </p>{' '}
          </div>{' '}
          <div className="space-y-1">
            {' '}
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Muted Text
            </span>{' '}
            <p className="text-sm text-muted-foreground">
              Enter your email address to receive updates.
            </p>{' '}
          </div>{' '}
        </div>{' '}
      </section>{' '}
    </div>
  ),
};
const ColorBlock = ({
  label,
  bg,
  text,
  border,
}: {
  label: string;
  bg: string;
  text: string;
  border?: string;
}) => (
  <div className="space-y-2">
    {' '}
    <div
      className={`h-24 rounded-xl ${bg} ${border ? `border ${border}` : ''} flex items-end p-3 shadow-sm`}
    >
      {' '}
      <span className={`text-xs font-bold uppercase tracking-wider ${text}`}>{label}</span>{' '}
    </div>{' '}
    <div className="flex justify-between px-1 text-xs text-muted-foreground">
      {' '}
      <span>{bg}</span>{' '}
    </div>{' '}
  </div>
);
