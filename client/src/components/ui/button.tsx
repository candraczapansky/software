import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent text-primary border border-primary hover:bg-[hsla(var(--button-primary-hover),var(--button-primary-hover-opacity,0.1))]",
        destructive:
          "bg-transparent text-destructive border border-destructive hover:bg-[hsla(var(--destructive),0.1)]",
        outline:
          "border border-input bg-background hover:bg-[hsla(var(--button-outline-hover),var(--button-outline-hover-opacity,0.1))] hover:text-accent-foreground",
        brandOutline:
          "bg-transparent !bg-none text-[hsl(var(--primary))] border border-[hsl(var(--primary))] hover:bg-[hsla(var(--primary),0.1)] hover:text-[hsl(var(--primary))]",
        secondary:
          "bg-transparent text-secondary border border-secondary hover:bg-[hsla(var(--secondary),0.1)]",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
