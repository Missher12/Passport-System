import React from 'react';

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Shared global page container enforcing unified 70% desktop width,
 * tablet adaptation, and 100% mobile width with horizontal overflow protection.
 */
export function PageContainer({ children, className = '', ...rest }: PageContainerProps) {
  return (
    <div className={`page-container ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
