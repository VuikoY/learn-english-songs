import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "outline" | "ghost";
    size?: "default" | "sm" | "lg";
}

export function buttonVariants({
    variant = "default",
    size = "default",
    className,
}: Pick<ButtonProps, "variant" | "size" | "className"> = {}) {
    const variants = {
        default: "bg-blue-600 text-white hover:bg-blue-700 shadow",
        outline: "border border-slate-300 bg-transparent hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800",
        ghost: "hover:bg-slate-100 dark:hover:bg-slate-800",
    };
    const sizes = {
        default: "h-10 px-4 py-2 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-8 text-base",
    };
    const baseStyles = "inline-flex items-center justify-center font-medium rounded-md transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none";

    return cn(baseStyles, variants[variant], sizes[size], className);
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "default", size = "default", ...props }, ref) => {
        const baseStyles = "inline-flex items-center justify-center font-medium rounded-md transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none";

        const variants = {
            default: "bg-blue-600 text-white hover:bg-blue-700 shadow",
            outline: "border border-slate-300 bg-transparent hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800",
            ghost: "hover:bg-slate-100 dark:hover:bg-slate-800",
        };

        const sizes = {
            default: "h-10 px-4 py-2 text-sm",
            sm: "h-8 px-3 text-xs",
            lg: "h-11 px-8 text-base",
        };

        return (
            <button
                className={cn(baseStyles, variants[variant], sizes[size], className)}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = "Button";
