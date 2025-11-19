'use client'

import { ReactNode } from 'react'

interface LayoutShellProps {
  children: ReactNode
  sidebar: ReactNode
}

export function LayoutShell({ children, sidebar }: LayoutShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {sidebar}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}

