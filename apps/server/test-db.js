import { prisma } from './src/config/prisma';

console.log('Testing Prisma connection...');

try {
  await prisma.$connect();
  console.log('✅ Prisma connected');

  // Test a simple query
  const result = await prisma.$queryRaw`SELECT 1 as test`;
  console.log('Query result:', result);

  await prisma.$disconnect();
  console.log('✅ Prisma disconnected');
  console.log('✅ All tests passed');
} catch (error) {
  console.error('❌ Error:', String(error));
  process.exit(1);
}
