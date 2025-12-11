'use client'

import { Sparkles, BarChart3, PieChart, TrendingUp, Filter } from 'lucide-react'
import { DEMO_QUERIES } from '@/lib/utils/demoQueries'
import { cn } from '@/lib/utils'

interface DemoQueriesProps {
  onSelectQuery: (query: string) => void
  className?: string
}

const iconMap = {
  bar: BarChart3,
  pie: PieChart,
  line: TrendingUp,
  table: Filter,
}

export function DemoQueries({ onSelectQuery, className }: DemoQueriesProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="mb-3 opacity-60">
        <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
          Sample queries • Click to try
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
        {DEMO_QUERIES.map((demoQuery) => {
          const Icon = demoQuery.chartType ? iconMap[demoQuery.chartType] || Sparkles : Sparkles
          
          return (
            <button
              key={demoQuery.id}
              onClick={() => onSelectQuery(demoQuery.query)}
              className={cn(
                'demo-query-subtle text-left p-2 sm:p-3',
                'group cursor-pointer transform-3d'
              )}
            >
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-md bg-primary/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                  <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-primary/60 group-hover:text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-[10px] sm:text-xs mb-0.5 group-hover:text-primary transition-colors line-clamp-1">
                    {demoQuery.label}
                  </h3>
                  <p className="text-[9px] sm:text-[10px] text-muted-foreground/70 line-clamp-1">
                    {demoQuery.description}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
