import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary-soft text-primary",
        sand: "border-sand/50 bg-sand-soft text-sand-foreground",
        secondary: "border-transparent bg-secondary text-muted-foreground",
        outline: "border-border bg-card text-muted-foreground",
        success: "border-success/15 bg-success-soft text-success",
        warning: "border-warning/20 bg-warning-soft text-warning-foreground",
        destructive: "border-destructive/15 bg-destructive-soft text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const DOT_COLOR: Record<string, string> = {
  default: "bg-primary",
  sand: "bg-sand-foreground",
  secondary: "bg-muted-foreground",
  outline: "bg-muted-foreground",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Show a leading status dot — reads faster than colour alone in dense lists. */
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", DOT_COLOR[variant ?? "default"])}
        />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
