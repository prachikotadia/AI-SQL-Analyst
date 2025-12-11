/**
 * Export utilities for CSV, Excel, PDF, and image exports
 */

export function exportToCSV(data: Record<string, any>[], columns: Array<{ name: string; type: string }>, filename: string = 'export.csv') {
  if (!data || data.length === 0) {
    throw new Error('No data to export')
  }

  const headers = columns.map(col => col.name)
  const csvRows: string[] = []
  
  // Add header row
  csvRows.push(headers.map(h => escapeCSVValue(h)).join(','))
  
  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header]
      return escapeCSVValue(value)
    })
    csvRows.push(values.join(','))
  }
  
  const csvContent = csvRows.join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, filename)
}

export function exportToExcel(data: Record<string, any>[], columns: Array<{ name: string; type: string }>, filename: string = 'export.xlsx') {
  // For Excel export, we'll use a CSV format that Excel can open
  // In a production app, you'd use a library like xlsx or exceljs
  exportToCSV(data, columns, filename.replace(/\.xlsx?$/i, '.csv'))
}

export function exportChartAsImage(chartElement: HTMLElement, filename: string = 'chart.png', format: 'png' | 'svg' = 'png') {
  if (format === 'svg') {
    // For SVG, get the SVG element and export it
    const svgElement = chartElement.querySelector('svg')
    if (!svgElement) {
      throw new Error('No SVG element found in chart')
    }
    
    const svgData = new XMLSerializer().serializeToString(svgElement)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    downloadBlob(svgBlob, filename)
  } else {
    // For PNG, use html2canvas or similar
    import('html2canvas').then(html2canvas => {
      html2canvas.default(chartElement, {
        backgroundColor: '#ffffff',
        scale: 2,
      }).then(canvas => {
        canvas.toBlob((blob) => {
          if (blob) {
            downloadBlob(blob, filename)
          }
        }, 'image/png')
      })
    }).catch(() => {
      // Fallback: try to export as SVG if html2canvas fails
      exportChartAsImage(chartElement, filename.replace(/\.png$/i, '.svg'), 'svg')
    })
  }
}

export async function exportFullReport(
  data: Record<string, any>[],
  columns: Array<{ name: string; type: string }>,
  chartElement: HTMLElement | null,
  query: string,
  reasoning: string,
  sql: string,
  filename: string = 'report.pdf'
) {
  // For PDF export, we'll create an HTML document and use browser print
  // In production, you'd use a library like jsPDF or puppeteer
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Query Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #333; }
        h2 { color: #666; margin-top: 20px; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .chart-container { margin: 20px 0; text-align: center; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <h1>Query Report</h1>
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
      
      <h2>Query</h2>
      <p>${escapeHtml(query)}</p>
      
      <h2>Reasoning</h2>
      <p>${escapeHtml(reasoning)}</p>
      
      <h2>SQL</h2>
      <pre>${escapeHtml(sql)}</pre>
      
      ${chartElement ? '<h2>Chart</h2><div class="chart-container">[Chart would be rendered here]</div>' : ''}
      
      <h2>Data (${data.length} rows)</h2>
      <table>
        <thead>
          <tr>
            ${columns.map(col => `<th>${escapeHtml(col.name)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.slice(0, 100).map(row => `
            <tr>
              ${columns.map(col => `<td>${escapeHtml(String(row[col.name] ?? ''))}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${data.length > 100 ? `<p><em>Showing first 100 of ${data.length} rows</em></p>` : ''}
    </body>
    </html>
  `
  
  const blob = new Blob([htmlContent], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const printWindow = window.open(url, '_blank')
  
  if (printWindow) {
    printWindow.onload = () => {
      printWindow.print()
    }
  }
}

function escapeCSVValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
