/**
 * Demo queries for sample data
 * These queries work without OpenAI API key
 */

export interface DemoQuery {
  id: string
  label: string
  query: string
  sql: string
  reasoning: string
  chartType: 'bar' | 'pie' | 'line' | 'table' | null
  xField: string | null
  yField: string | null
  description: string
}

export const DEMO_QUERIES: DemoQuery[] = [
  {
    id: 'demo-1',
    label: 'Top 10 Products by Revenue',
    query: 'Show me the top 10 products by revenue',
    sql: 'SELECT "Product Name", "Category", "Price", "Stock", "Revenue" FROM sample_data ORDER BY CAST("Revenue" AS DOUBLE PRECISION) DESC LIMIT 10',
    reasoning: 'This query retrieves the top 10 products sorted by revenue in descending order. Revenue is cast to numeric to ensure proper sorting.',
    chartType: 'bar',
    xField: 'Product Name',
    yField: 'Revenue',
    description: 'See which products generate the most revenue',
  },
  {
    id: 'demo-2',
    label: 'Products by Category',
    query: 'Show me the count of products in each category',
    sql: 'SELECT "Category", COUNT(*) as count FROM sample_data GROUP BY "Category"',
    reasoning: 'This query groups products by category and counts how many products are in each category.',
    chartType: 'pie',
    xField: 'Category',
    yField: 'count',
    description: 'Visualize product distribution across categories',
  },
  {
    id: 'demo-3',
    label: 'Average Price by Category',
    query: 'What is the average price for each category?',
    sql: 'SELECT "Category", AVG(CAST("Price" AS DOUBLE PRECISION)) as avg_price FROM sample_data GROUP BY "Category"',
    reasoning: 'This query calculates the average price for each product category by grouping and aggregating the Price column.',
    chartType: 'bar',
    xField: 'Category',
    yField: 'avg_price',
    description: 'Compare average prices across different categories',
  },
  {
    id: 'demo-4',
    label: 'Low Stock Products',
    query: 'Show me all products with stock less than 50',
    sql: 'SELECT "Product Name", "Category", "Price", "Stock", "Revenue" FROM sample_data WHERE CAST("Stock" AS DOUBLE PRECISION) < 50 ORDER BY CAST("Stock" AS DOUBLE PRECISION) ASC',
    reasoning: 'This query filters products where stock is less than 50 and orders them by stock level in ascending order to show items that need restocking.',
    chartType: 'table',
    xField: null,
    yField: null,
    description: 'Identify products that need restocking',
  },
  {
    id: 'demo-5',
    label: 'Total Revenue by Category',
    query: 'Show me the total revenue for each category',
    sql: 'SELECT "Category", SUM(CAST("Revenue" AS DOUBLE PRECISION)) as total_revenue FROM sample_data GROUP BY "Category"',
    reasoning: 'This query calculates the total revenue for each category by summing up all revenue values grouped by category.',
    chartType: 'bar',
    xField: 'Category',
    yField: 'total_revenue',
    description: 'See which categories generate the most total revenue',
  },
]

export function getDemoQueryById(id: string): DemoQuery | undefined {
  return DEMO_QUERIES.find(q => q.id === id)
}

export function getDemoQueryByQuery(query: string): DemoQuery | undefined {
  return DEMO_QUERIES.find(q => q.query.toLowerCase() === query.toLowerCase())
}
