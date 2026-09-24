import 'dotenv/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  let organization = await prisma.organization.findFirst({
    where: { name: 'Goodeva' },
  });

  if (organization) {
    console.log(
      `Organization "${organization.name}" already exists. Skipping seeding.`,
    );
  } else {
    const rawApiKey = `sk_gd_${randomBytes(16).toString('hex')}`;
    const apiKeyHash = createHash('sha256').update(rawApiKey).digest('hex');

    organization = await prisma.organization.create({
      data: {
        name: 'Goodeva',
        apiKey: apiKeyHash,
      },
    });

    console.log(`Seeded organization: "${organization.name}"`);
    console.log(`API KEY (save this for testing): ${rawApiKey}`);
  }
}

main()
  .catch((e) => {
    console.error('Failed to seed database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
