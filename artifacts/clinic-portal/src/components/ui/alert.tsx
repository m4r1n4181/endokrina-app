import * as React from 'react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const alertVariants = cva(
  'relative w-full rounded-lg border px-4 py-3 text-base [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-[0.9rem] [&>svg]:size-5 [&>svg~*]:pl-8',
  {
    variants: {
      variant: {
        default: 'bg-card text-foreground [&>svg]:text-muted-foreground',
        info: 'border-info-border bg-info-soft text-foreground [&>svg]:text-info',
        warning: 'border-warning-border bg-warning-soft text-foreground [&>svg]:text-warning',
        success: 'border-success-border bg-success-soft text-foreground [&>svg]:text-success',
        destructive: 'border-destructive-border bg-destructive-soft text-foreground [&>svg]:text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-semibold leading-snug', className)}
    {...props}
  />
));
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-base leading-relaxed text-foreground/85', className)}
    {...props}
  />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
