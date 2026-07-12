import { GripVertical } from "lucide-react";
import * as ResizablePrimitive from "react-resizable-panels";

import { cn } from "@/lib/utils";

type PanelGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  direction?: 'horizontal' | 'vertical';
  id?: string;
  autoSaveId?: string;
  storage?: unknown;
  onLayout?: (sizes: number[]) => void;
};

type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  id?: string;
  order?: number;
  collapsible?: boolean;
  collapsedSize?: number;
  onCollapse?: () => void;
  onExpand?: () => void;
  onResize?: (size: number) => void;
};

type PanelResizeHandleProps = React.HTMLAttributes<HTMLDivElement> & {
  disabled?: boolean;
  id?: string;
  onDragging?: (isDragging: boolean) => void;
};

interface ResizablePanelsModule {
  PanelGroup: React.ForwardRefExoticComponent<PanelGroupProps & React.RefAttributes<unknown>>;
  Panel: React.ForwardRefExoticComponent<PanelProps & React.RefAttributes<unknown>>;
  PanelResizeHandle: React.ForwardRefExoticComponent<PanelResizeHandleProps & React.RefAttributes<unknown>>;
}

const RP = ResizablePrimitive as unknown as ResizablePanelsModule; // ignore-audit — react-resizable-panels exports don't match inferred module shape; pattern from shadcn/ui

const ResizablePanelGroup = ({ className, ...props }: PanelGroupProps) => (
  <RP.PanelGroup
    className={cn("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", className)}
    {...props}
  />
);

const ResizablePanel = RP.Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: PanelResizeHandleProps & {
  withHandle?: boolean;
}) => (
  <RP.PanelResizeHandle
    className={cn(
      "relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 [&[data-panel-group-direction=vertical]>div]:rotate-90",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </RP.PanelResizeHandle>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
