import { prisma } from './client'

export interface TableSchema {
  name: string
  columns: ColumnSchema[]
}

export interface ColumnSchema {
  name: string
  type: string
  nullable: boolean
}

export async function getDatabaseSchema(): Promise<TableSchema[]> {
  try {
    // Dynamically fetch schema from PostgreSQL information_schema
    const result = await prisma.$queryRaw<Array<{
      table_name: string
      column_name: string
      data_type: string
      is_nullable: string
    }>>`
      SELECT 
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable
      FROM information_schema.tables t
      JOIN information_schema.columns c 
        ON t.table_name = c.table_name 
        AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT LIKE '_prisma%'
        AND t.table_name NOT LIKE 'pg_%'
      ORDER BY t.table_name, c.ordinal_position
    `

    // Group columns by table
    const tableMap = new Map<string, TableSchema>()
    
    for (const row of result) {
      if (!tableMap.has(row.table_name)) {
        tableMap.set(row.table_name, {
          name: row.table_name,
          columns: [],
        })
      }
      
      const table = tableMap.get(row.table_name)!
      table.columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
      })
    }

    return Array.from(tableMap.values())
  } catch (error) {
    console.error('Error fetching database schema dynamically, falling back to static schema:', error)
    
    // Fallback to static schema if dynamic query fails
    const tables: TableSchema[] = [
      {
        name: 'products',
        columns: [
          { name: 'id', type: 'integer', nullable: false },
          { name: 'name', type: 'text', nullable: false },
          { name: 'category', type: 'text', nullable: false },
          { name: 'price', type: 'decimal', nullable: false },
          { name: 'created_at', type: 'timestamp', nullable: false },
          { name: 'updated_at', type: 'timestamp', nullable: false },
        ],
      },
      {
        name: 'customers',
        columns: [
          { name: 'id', type: 'integer', nullable: false },
          { name: 'name', type: 'text', nullable: false },
          { name: 'region', type: 'text', nullable: false },
          { name: 'created_at', type: 'timestamp', nullable: false },
        ],
      },
      {
        name: 'orders',
        columns: [
          { name: 'id', type: 'integer', nullable: false },
          { name: 'customer_id', type: 'integer', nullable: false },
          { name: 'order_date', type: 'timestamp', nullable: false },
          { name: 'total_amount', type: 'decimal', nullable: false },
        ],
      },
      {
        name: 'order_items',
        columns: [
          { name: 'id', type: 'integer', nullable: false },
          { name: 'order_id', type: 'integer', nullable: false },
          { name: 'product_id', type: 'integer', nullable: false },
          { name: 'quantity', type: 'integer', nullable: false },
          { name: 'unit_price', type: 'decimal', nullable: false },
        ],
      },
    ]

    return tables
  }
}

export function formatSchemaForPrompt(schema: TableSchema[], maxTables: number = 20): string {
  const tablesToShow = schema.slice(0, maxTables)
  const remainingTables = schema.length - maxTables
  
  let formatted = 'SCHEMA (use EXACT column names as shown):\n'
  
  for (const table of tablesToShow) {
    // Show exact column names - use quotes if they contain capitals or special chars
    const columns = table.columns.map(col => {
      // If column name has capitals or special chars, show with quotes
      const needsQuotes = /[A-Z]/.test(col.name) || /[^a-z0-9_]/.test(col.name)
      const displayName = needsQuotes ? `"${col.name}"` : col.name
      return `${displayName}:${col.type}`
    }).join(', ')
    formatted += `${table.name}(${columns})\n`
  }
  
  if (remainingTables > 0) {
    formatted += `... and ${remainingTables} more tables\n`
  }

  // Only show key relationships (compact)
  const tableNames = schema.map(t => t.name.toLowerCase())
  const relationships: string[] = []
  if (tableNames.includes('orders') && tableNames.includes('customers')) {
    relationships.push('orders.customer_id→customers.id')
  }
  if (tableNames.includes('orders') && tableNames.includes('order_items')) {
    relationships.push('orders.id→order_items.order_id')
  }
  if (tableNames.includes('products') && tableNames.includes('order_items')) {
    relationships.push('products.id→order_items.product_id')
  }
  
  if (relationships.length > 0) {
    formatted += `FKs: ${relationships.join(', ')}\n`
  }
  
  formatted += '\nCRITICAL: Use EXACT column names from above. PostgreSQL is case-sensitive for quoted identifiers.\n'

  return formatted
}

