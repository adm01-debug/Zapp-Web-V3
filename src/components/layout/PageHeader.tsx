import { Fragment } from 'react';
import { ChevronLeft, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Breadcrumb Item interface definition. */
export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Contextual page header with breadcrumbs and quick actions
 * Provides wayfinding and navigation context
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs = [],
  showBack = false,
  onBack,
  actions,
  className,
}: PageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className={cn(
      'flex flex-col gap-2 px-6 py-4 border-b border-border/50 bg-card',
      className
    )}>
      {/* Breadcrumbs row */}
      {breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {/* Home item */}
            <BreadcrumbItem>
              <BreadcrumbLink 
                href="/" 
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                <span className="sr-only">Início</span>
              </BreadcrumbLink>
            </BreadcrumbItem>

            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              
              return (
                // FIX: BreadcrumbSeparator (<li>) must be a SIBLING of BreadcrumbItem (<li>),
                // not nested inside it. Use Fragment with key to wrap both as siblings
                // inside the parent BreadcrumbList (<ol>).
                // Previously: <BreadcrumbItem><BreadcrumbSeparator/>...</BreadcrumbItem>
                // caused invalid <li> inside <li> DOM nesting (HTML spec violation).
                <Fragment key={crumb.label}>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink
                        href={crumb.href}
                        onClick={(e) => {
                          if (crumb.onClick) {
                            e.preventDefault();
                            crumb.onClick();
                          }
                        }}
                        className="hover:text-foreground transition-colors"
                      >
                        {crumb.label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      {/* Title row with actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="w-8 h-8 shrink-0"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}

          <div className="min-w-0">
            <h1 className="text-xl font-display font-bold text-foreground truncate">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
