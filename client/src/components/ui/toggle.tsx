import { cva } from "class-variance-authority";

export const toggleVariants = cva("inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium", {
  variants: {
    variant: {
      default: "bg-muted text-foreground",
      outline: "border border-input bg-background",
    },
    size: {
      default: "h-10",
      sm: "h-8 text-xs",
      lg: "h-12 text-base",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});
