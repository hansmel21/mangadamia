import { prisma } from "../src/db/client.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  throw new Error("Usage: npm run owner:promote -- owner@example.com");
}

const user = await prisma.user.findUnique({ where: { email } });
if (!user) throw new Error(`No account exists for ${email}`);

await prisma.user.update({ where: { id: user.id }, data: { role: "owner" } });
console.log(`Promoted @${user.username} (${email}) to owner.`);
await prisma.$disconnect();
