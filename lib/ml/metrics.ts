import type { MetricDefinition } from '@/types'

export const METRICS_CATALOG: MetricDefinition[] = [
  {
    id: 'total_revenue',
    name: 'total_revenue',
    displayName: 'Total Revenue',
    description: 'Sum of all order amounts calculated from order_items (quantity * unit_price)',
    sqlExpression: 'SUM(order_items.quantity * order_items.unit_price)',
    defaultGrain: ['day', 'month', 'category', 'region'],
    defaultTimeRange: 'last_30_days',
    exampleQueries: [
      'Show total revenue',
      'What is the total revenue?',
      'How much revenue did we make?',
      'Show revenue in the last 30 days',
    ],
  },
  {
    id: 'average_order_value',
    name: 'average_order_value',
    displayName: 'Average Order Value',
    description: 'Average amount per order (total_amount / order_count)',
    sqlExpression: 'AVG(orders.total_amount)',
    defaultGrain: ['day', 'month', 'category'],
    defaultTimeRange: 'last_30_days',
    exampleQueries: [
      'What is the average order value?',
      'Show average order value over time',
      'Calculate average order amount',
    ],
  },
  {
    id: 'orders_count',
    name: 'orders_count',
    displayName: 'Orders Count',
    description: 'Total number of orders placed',
    sqlExpression: 'COUNT(orders.id)',
    defaultGrain: ['day', 'month', 'category', 'region'],
    defaultTimeRange: 'last_30_days',
    exampleQueries: [
      'How many orders were placed?',
      'Show order count by category',
      'Count orders in the last month',
    ],
  },
  {
    id: 'customers_count',
    name: 'customers_count',
    displayName: 'Customers Count',
    description: 'Total number of unique customers',
    sqlExpression: 'COUNT(DISTINCT customers.id)',
    defaultGrain: ['region'],
    defaultTimeRange: 'all_time',
    exampleQueries: [
      'How many customers do we have?',
      'Show customer count by region',
      'Total number of customers',
    ],
  },
  {
    id: 'products_sold',
    name: 'products_sold',
    displayName: 'Products Sold',
    description: 'Total quantity of products sold across all orders',
    sqlExpression: 'SUM(order_items.quantity)',
    defaultGrain: ['day', 'month', 'category'],
    defaultTimeRange: 'last_30_days',
    exampleQueries: [
      'How many products were sold?',
      'Show products sold by category',
      'Total quantity sold',
    ],
  },
  {
    id: 'revenue_by_category',
    name: 'revenue_by_category',
    displayName: 'Revenue by Category',
    description: 'Revenue grouped by product category',
    sqlExpression: 'SUM(order_items.quantity * order_items.unit_price)',
    defaultGrain: ['category'],
    defaultTimeRange: 'last_30_days',
    exampleQueries: [
      'Show revenue by category',
      'What is the revenue breakdown by category?',
      'Category revenue breakdown',
    ],
  },
]

export function getMetricByName(name: string): MetricDefinition | undefined {
  return METRICS_CATALOG.find(m => m.name === name)
}

export function getMetricById(id: string): MetricDefinition | undefined {
  return METRICS_CATALOG.find(m => m.id === id)
}

/**
 * Format metrics for prompt with compact format to reduce token usage
 */
export function formatMetricsForPrompt(): string {
  // Compact format: id:displayName:sqlExpression
  const metrics = METRICS_CATALOG.map(m => 
    `${m.id}:${m.displayName}:${m.sqlExpression}`
  ).join('\n')
  
  return `METRICS:\n${metrics}\n`
}

