'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FileText, TrendingUp, BarChart3, Filter, Layers } from 'lucide-react'
import { QUERY_TEMPLATES } from '@/lib/utils/querySuggestions'

interface QueryTemplatesProps {
  onSelectTemplate: (template: string) => void
}

export function QueryTemplates({ onSelectTemplate }: QueryTemplatesProps) {
  const templatesByCategory = QUERY_TEMPLATES.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = []
    }
    acc[template.category].push(template)
    return acc
  }, {} as Record<string, typeof QUERY_TEMPLATES>)

  const categoryIcons: Record<string, React.ReactNode> = {
    analysis: <TrendingUp className="h-4 w-4" />,
    aggregation: <Layers className="h-4 w-4" />,
    filtering: <Filter className="h-4 w-4" />,
    comparison: <BarChart3 className="h-4 w-4" />,
    trends: <TrendingUp className="h-4 w-4" />,
  }

  const categoryLabels: Record<string, string> = {
    analysis: 'Analysis',
    aggregation: 'Aggregation',
    filtering: 'Filtering',
    comparison: 'Comparison',
    trends: 'Trends',
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 min-h-[44px] text-xs sm:text-sm">
          <FileText className="h-4 w-4" />
          <span className="hidden sm:inline">Templates</span>
          <span className="sm:hidden">Tpl</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 sm:w-72 max-h-[80vh] overflow-y-auto">
        <DropdownMenuLabel>Query Templates</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(templatesByCategory).map(([category, templates]) => (
          <div key={category}>
            <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              {categoryIcons[category]}
              {categoryLabels[category]}
            </DropdownMenuLabel>
            {templates.map((template) => (
              <DropdownMenuItem
                key={template.id}
                onClick={() => onSelectTemplate(template.query)}
                className="flex flex-col items-start gap-1"
              >
                <div className="font-medium">{template.label}</div>
                <div className="text-xs text-muted-foreground">{template.description}</div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
