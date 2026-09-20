import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Minimal `asChild` implementation: merges the wrapper's props onto its single
 * child element. Avoids pulling in a component library for one behaviour.
 */
export function Slot({ children, className, ...props }: { children?: ReactNode; className?: string } & Record<string, unknown>) {
  const child = Children.only(children) as ReactElement<Record<string, unknown>>;
  if (!isValidElement(child)) return null;

  const childProps = child.props;
  return cloneElement(child, {
    ...props,
    ...childProps,
    className: cn(className, childProps['className'] as string | undefined),
  });
}
