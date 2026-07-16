import { CalendarDays, ChevronDown, X } from 'lucide-react';

interface FlowComponent {
  id: string;
  type:
    | 'TextHeading'
    | 'TextSubheading'
    | 'TextBody'
    | 'TextInput'
    | 'TextArea'
    | 'DatePicker'
    | 'RadioButtonsGroup'
    | 'CheckboxGroup'
    | 'Dropdown'
    | 'Image'
    | 'OptIn'
    | 'Footer';
  label?: string;
  name?: string;
  required?: boolean;
  options?: { id: string; title: string }[];
  text?: string;
  src?: string;
}

export type { FlowComponent };

export function FlowComponentPreview({
  comp,
  preview,
  onRemove,
}: {
  comp: FlowComponent;
  preview: boolean;
  onRemove?: () => void;
}) {
  return (
    <div className="group relative">
      {!preview && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {renderComponent(comp)}
    </div>
  );
}

function renderComponent(comp: FlowComponent) {
  switch (comp.type) {
    case 'TextHeading':
      return <h2 className="text-lg font-bold text-foreground">{comp.text || 'Título'}</h2>;
    case 'TextSubheading':
      return (
        <h3 className="text-base font-semibold text-foreground">{comp.text || 'Subtítulo'}</h3>
      );
    case 'TextBody':
      return <p className="text-sm text-muted-foreground">{comp.text || 'Texto'}</p>;
    case 'TextInput':
      return (
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            {comp.label || 'Campo'}
          </label>
          <div className="flex h-9 items-center rounded-lg border border-border bg-muted/20 px-3 text-sm text-muted-foreground">
            Digite aqui...
          </div>
        </div>
      );
    case 'TextArea':
      return (
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            {comp.label || 'Campo'}
          </label>
          <div className="h-20 rounded-lg border border-border bg-muted/20 px-3 pt-2 text-sm text-muted-foreground">
            Digite aqui...
          </div>
        </div>
      );
    case 'DatePicker':
      return (
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            {comp.label || 'Data'}
          </label>
          <div className="flex h-9 items-center justify-between rounded-lg border border-border bg-muted/20 px-3 text-sm text-muted-foreground">
            <span>dd/mm/aaaa</span>
            <CalendarDays className="h-4 w-4" />
          </div>
        </div>
      );
    case 'RadioButtonsGroup':
      return (
        <div>
          <label className="mb-2 block text-xs font-medium text-foreground">
            {comp.label || 'Escolha'}
          </label>
          {comp.options?.map((opt) => (
            <div key={opt.id} className="flex items-center gap-2 py-1">
              <div className="h-4 w-4 rounded-full border-2 border-primary" />
              <span className="text-sm">{opt.title}</span>
            </div>
          ))}
        </div>
      );
    case 'CheckboxGroup':
      return (
        <div>
          <label className="mb-2 block text-xs font-medium text-foreground">
            {comp.label || 'Marque'}
          </label>
          {comp.options?.map((opt) => (
            <div key={opt.id} className="flex items-center gap-2 py-1">
              <div className="h-4 w-4 rounded border-2 border-primary" />
              <span className="text-sm">{opt.title}</span>
            </div>
          ))}
        </div>
      );
    case 'Dropdown':
      return (
        <div>
          <label className="mb-1 block text-xs font-medium text-foreground">
            {comp.label || 'Selecione'}
          </label>
          <div className="flex h-9 items-center justify-between rounded-lg border border-border bg-muted/20 px-3 text-sm text-muted-foreground">
            <span>Selecione...</span>
            <ChevronDown className="h-4 w-4" />
          </div>
        </div>
      );
    case 'Footer':
      return (
        <button
          type="button"
          className="mt-4 h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground"
        >
          {comp.label || 'Enviar'}
        </button>
      );
    default:
      return (
        <div className="rounded bg-muted/20 p-2 text-xs text-muted-foreground">{comp.type}</div>
      );
  }
}
