import { useTheme } from '@/hooks/useTheme';
import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      position="bottom-right"
      expand={false}
      closeButton
      duration={4000}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border/60 group-[.toaster]:shadow-[0_8px_30px_-8px_hsl(var(--foreground)/0.12)] group-[.toaster]:rounded-xl',
          title: 'group-[.toast]:font-semibold',
          description: 'group-[.toast]:text-[13px] group-[.toast]:opacity-90',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:font-medium group-[.toast]:shadow-none',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg',
          closeButton:
            'group-[.toast]:bg-card group-[.toast]:border-border/40 group-[.toast]:text-muted-foreground group-[.toast]:hover:text-foreground',
          // Uso de foregrounds sólidos garante contraste WCAG AA (>= 4.5:1).
          success:
            'group-[.toaster]:!bg-success group-[.toaster]:!border-success group-[.toaster]:!text-success-foreground',
          error:
            'group-[.toaster]:!bg-destructive group-[.toaster]:!border-destructive group-[.toaster]:!text-destructive-foreground',
          warning:
            'group-[.toaster]:!bg-warning group-[.toaster]:!border-warning group-[.toaster]:!text-warning-foreground',
          info:
            'group-[.toaster]:!bg-info group-[.toaster]:!border-info group-[.toaster]:!text-info-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
