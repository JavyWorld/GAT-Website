import * as React from "react";

interface TooltipProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  asChild?: boolean;
  side?: string;
  align?: string;
  delayDuration?: number;
}

export function Tooltip({ children }: TooltipProps) {
  return <>{children}</>;
}

export function TooltipTrigger({ children }: TooltipProps) {
  return <>{children}</>;
}

export function TooltipContent({ children, ...props }: TooltipProps) {
  return <div {...props}>{children}</div>;
}

export function TooltipProvider({ children }: TooltipProps) {
  return <>{children}</>;
}
