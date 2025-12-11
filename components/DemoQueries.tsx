'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card className={cn('neumorphic-card', className)}>
      <CardHeader className="p-3 sm:p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-base sm:text-lg">Demo Queries</CardTitle>
        </div>
        <CardDescription className="text-xs sm:text-sm">
          Try these sample queries to see how the system works. No API key required!
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {DEMO_QUERIES.map((demoQuery) => {
            const Icon = demoQuery.chartType ? iconMap[demoQuery.chartType] || Sparkles : Sparkles
            
            return (
              <button
                key={demoQuery.id}
                onClick={() => onSelectQuery(demoQuery.query)}
                className={cn(
                  'text-left p-3 sm:p-4 rounded-lg border-2 border-dashed',
                  'hover:border-primary/50 hover:bg-primary/5',
                  'transition-all duration-200',
                  'group cursor-pointer'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base mb-1 group-hover:text-primary transition-colors">
                      {demoQuery.label}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2">
                      {demoQuery.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] sm:text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                        {demoQuery.chartType || 'table'}
                      </span>
                      <span className="text-[10px] sm:text-xs text-muted-foreground">
                        Click to run
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
