export default {
  schema: './prisma/schema.prisma',
  datasource: {
    url:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/content-publish',
  },
};
