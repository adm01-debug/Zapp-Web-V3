import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 overflow-hidden whitespace-normal break-words rounded-lg text-sm font-medium ring-offset-background transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/95 hover:shadow-glow-primary active:scale-[0.98]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/95 shadow-sm hover:shadow-glow-destructive active:scale-[0.98]",
        outline: "border border-border/80 bg-background hover:bg-accent hover:text-accent-foreground hover:border-primary/40 active:scale-[0.98]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/95 shadow-sm hover:shadow-glow-secondary active:scale-[0.98]",
        ghost: "hover:bg-accent/80 hover:text-accent-foreground active:scale-[0.98]",
        link: "text-primary underline-offset-4 hover:underline font-semibold",
        whatsapp: "bg-whatsapp text-primary-foreground hover:bg-whatsapp-dark shadow-sm hover:shadow-glow-success active:scale-[0.98]",
        glowPurple: "bg-secondary/15 text-secondary hover:bg-secondary/25 border border-secondary/20 shadow-none hover:shadow-glow-secondary active:scale-[0.98]",
        glowGradient: "bg-primary text-primary-foreground border border-primary/20 shadow-sm hover:shadow-glow-primary active:scale-[0.98]",
        neon: "bg-transparent border border-secondary text-secondary hover:bg-secondary/10 shadow-none hover:shadow-glow-secondary active:scale-[0.98]",
        neonOutline: "bg-transparent border border-secondary/40 text-secondary hover:border-secondary shadow-none hover:bg-secondary/10 hover:shadow-glow-secondary active:scale-[0.98]",
        success: "bg-success text-success-foreground hover:bg-success/95 shadow-sm hover:shadow-glow-success active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        xl: "h-12 rounded-lg px-10 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, loadingText, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    return (
      <Comp 
        className={cn(buttonVariants({ variant, size, className }))} 
        ref={ref} 
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {loadingText || children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

// Motion button with built-in hover/tap animations and neon glow
interface MotionButtonProps
  extends Omit<HTMLMotionProps<"button">, "ref">,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  loadingText?: string;
}

const MotionButton = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ className, variant, size, isLoading, loadingText, children, disabled, ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={disabled || isLoading ? undefined : { 
          scale: 1.02, 
          y: -2,
          transition: { duration: 0.2, ease: "easeOut" }
        }}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {loadingText || children}
          </>
        ) : (
          children
        )}
      </motion.button>
    );
  }
);
MotionButton.displayName = "MotionButton";

export { Button, MotionButton, buttonVariants };
