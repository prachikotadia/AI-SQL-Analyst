import { PrismaClient } from '@prisma/client'
import { faker } from '@faker-js/faker'

// Import and run cities seed
async function seedCities() {
  try {
    const { execSync } = await import('child_process')
    execSync('tsx prisma/seed-cities.ts', { stdio: 'inherit' })
  } catch (error) {
    console.error('Failed to seed cities:', error)
  }
}

const prisma = new PrismaClient()

const categories = ['Electronics', 'Books', 'Clothing', 'Home & Garden', 'Sports', 'Toys']
const regions = ['North America', 'Europe', 'Asia', 'South America', 'Africa', 'Oceania']

async function main() {
  // Seed cities data first
  await seedCities()
  console.log('🌱 Seeding database with faker...')

  // Clear existing data
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.product.deleteMany()
  await prisma.customer.deleteMany()

  // Create 2000+ products
  console.log('Creating products...')
  const products = []
  const productsPerCategory = Math.ceil(2000 / categories.length)
  
  for (const category of categories) {
    for (let i = 0; i < productsPerCategory; i++) {
      const product = await prisma.product.create({
        data: {
          name: faker.commerce.productName(),
          category,
          price: parseFloat(faker.commerce.price({ min: 10, max: 1000, dec: 2 })),
        },
      })
      products.push(product)
    }
  }
  console.log(`✅ Created ${products.length} products`)

  // Create 15000+ customers
  console.log('Creating customers...')
  const customers = []
  const batchSize = 500
  
  for (let i = 0; i < 15000; i += batchSize) {
    const batch = []
    for (let j = 0; j < batchSize && i + j < 15000; j++) {
      batch.push({
        name: faker.person.fullName(),
        region: faker.helpers.arrayElement(regions),
        createdAt: faker.date.past({ years: 3 }),
      })
    }
    
    await prisma.customer.createMany({
      data: batch,
      skipDuplicates: true,
    })
    
    if ((i + batchSize) % 2000 === 0) {
      console.log(`  Created ${Math.min(i + batchSize, 15000)} customers...`)
    }
  }
  
  // Fetch all customer IDs
  const customerRecords = await prisma.customer.findMany({ select: { id: true } })
  console.log(`✅ Created ${customerRecords.length} customers`)

  // Create 50000+ orders
  console.log('Creating orders...')
  const now = new Date()
  const startDate = new Date(now)
  startDate.setMonth(startDate.getMonth() - 24) // 24 months of data
  
  const orders = []
  const orderBatchSize = 1000
  
  for (let i = 0; i < 50000; i += orderBatchSize) {
    const orderBatch = []
    
    for (let j = 0; j < orderBatchSize && i + j < 50000; j++) {
      const orderDate = faker.date.between({ from: startDate, to: now })
      const customer = faker.helpers.arrayElement(customerRecords)
      
      orderBatch.push({
        customerId: customer.id,
        orderDate,
        totalAmount: 0, // Will be calculated from items
      })
    }
    
    // Create orders in batch
    for (const orderData of orderBatch) {
      const order = await prisma.order.create({
        data: orderData,
      })
      orders.push(order)
    }
    
    if ((i + orderBatchSize) % 5000 === 0) {
      console.log(`  Created ${Math.min(i + orderBatchSize, 50000)} orders...`)
    }
  }
  console.log(`✅ Created ${orders.length} orders`)

  // Create 200000+ order items
  console.log('Creating order items...')
  let totalOrderItems = 0
  const itemBatchSize = 2000
  
  for (let i = 0; i < orders.length; i += 100) {
    const orderBatch = orders.slice(i, i + 100)
    
    for (const order of orderBatch) {
      const numItems = faker.number.int({ min: 1, max: 8 })
      const orderItems = []
      let totalAmount = 0
      
      for (let j = 0; j < numItems; j++) {
        const product = faker.helpers.arrayElement(products)
        const quantity = faker.number.int({ min: 1, max: 10 })
        const unitPrice = Number(product.price)
        const itemTotal = unitPrice * quantity
        totalAmount += itemTotal
        
        orderItems.push({
          orderId: order.id,
          productId: product.id,
          quantity,
          unitPrice,
        })
        
        totalOrderItems++
      }
      
      // Create order items
      await prisma.orderItem.createMany({
        data: orderItems,
        skipDuplicates: true,
      })
      
      // Update order total
      await prisma.order.update({
        where: { id: order.id },
        data: { totalAmount },
      })
    }
    
    if ((i + 100) % 5000 === 0) {
      console.log(`  Processed ${Math.min(i + 100, orders.length)} orders (${totalOrderItems} items)...`)
    }
  }
  
  console.log(`✅ Created ${totalOrderItems} order items`)

  // Create indexes for performance
  console.log('Creating indexes...')
  try {
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_customers_region ON customers(region)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`)
    console.log('✅ Indexes created')
  } catch (error) {
    console.warn('⚠️  Index creation failed (may already exist):', error)
  }

  console.log('✨ Seeding completed!')
  console.log(`   Products: ${products.length}`)
  console.log(`   Customers: ${customerRecords.length}`)
  console.log(`   Orders: ${orders.length}`)
  console.log(`   Order Items: ${totalOrderItems}`)
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
