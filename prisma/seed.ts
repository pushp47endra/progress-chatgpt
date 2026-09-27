/**
 * Safe bootstrap seed for GATE AI.
 *
 * Creates the initial user account with a bcrypt-hashed password (never
 * plaintext), and default GATE CSE subjects. Reads credentials from
 * environment variables so no password is ever hardcoded in source.
 *
 * Run with: npm run seed
 * (requires INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD to be set,
 * e.g. in .env.local)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_SUBJECTS = [
  "General Aptitude",
  "Engineering Mathematics",
  "Discrete Mathematics",
  "Programming",
  "Data Structures",
  "Algorithms",
  "Theory of Computation",
  "Operating Systems",
  "Database Management Systems",
  "Computer Networks",
  "Computer Organization and Architecture",
  "Digital Logic",
  "Compiler Design",
];

async function main() {
  const username = process.env.INITIAL_ADMIN_USERNAME || "pushpendra";
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!password) {
    console.error(
      "\nERROR: INITIAL_ADMIN_PASSWORD is not set.\n" +
        "Set it in your .env.local before running the seed, e.g.:\n" +
        "  INITIAL_ADMIN_PASSWORD=your-chosen-password\n"
    );
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`User "${username}" already exists. Skipping user creation.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        settings: { create: {} },
      },
    });
    console.log(`Created user "${user.username}" (id: ${user.id}).`);

    await prisma.subject.createMany({
      data: DEFAULT_SUBJECTS.map((name) => ({ userId: user.id, name, isDefault: true })),
    });
    console.log(`Seeded ${DEFAULT_SUBJECTS.length} default subjects.`);
  }

  console.log("\nSeed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });