import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { loadProjectEnv } from '../src/common/project-env';

loadProjectEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL não está definido no .env');

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function upsertChatUser(username: string, password: string, name: string) {
  const passwordHash = await argon2.hash(password);

  await prisma.user.upsert({
    where: { username },
    update: { name, passwordHash, isActive: true },
    create: { username, name, passwordHash, isActive: true },
  });
}

function pickEnv(name: string, fallback?: string) {
  const v = process.env[name];
  if (typeof v === 'string' && v.trim()) return v.trim();
  return fallback;
}

async function main() {
  // 1) AppConfig
  const primaryColor = pickEnv('SEED_PRIMARY_COLOR', '#001F3F')!;
  const primaryTextColor = pickEnv('SEED_PRIMARY_TEXT_COLOR', '#F0F0F0')!;
  const logoUrl = pickEnv('SEED_LOGO_URL', '') || null;

  await prisma.appConfig.upsert({
    where: { id: 'default' },
    update: { primaryColor, primaryTextColor, logoUrl: logoUrl ?? undefined },
    create: { id: 'default', primaryColor, primaryTextColor, logoUrl: logoUrl ?? undefined },
  });

  // 2) SuperAdmin (sempre existe 1)
  const superUser = pickEnv('SEED_SUPERADMIN_USERNAME', 'superadmin')!;
  const superPass = pickEnv('SEED_SUPERADMIN_PASSWORD', 'ChangeMeNow!123456')!;
  const superName = pickEnv('SEED_SUPERADMIN_NAME', 'SuperAdmin')!;

  const superHash = await argon2.hash(superPass);

  await prisma.adminAccount.upsert({
    where: { username: superUser },
    update: {
      name: superName,
      passwordHash: superHash,
      isActive: true,
      isSuperAdmin: true,
      mustChangeCredentials: true, // força troca no primeiro login
    },
    create: {
      username: superUser,
      name: superName,
      passwordHash: superHash,
      isActive: true,
      isSuperAdmin: true,
      mustChangeCredentials: true,
    },
  });

  // 2.1) Admin normal de teste (adminteste)
  const adminUser = pickEnv('SEED_ADMIN_USERNAME', 'adminteste')!;
  const adminPass = pickEnv('SEED_ADMIN_PASSWORD', 'admin123')!;
  const adminName = pickEnv('SEED_ADMIN_NAME', 'Administrador Teste')!;

  const adminHash = await argon2.hash(adminPass);

  await prisma.adminAccount.upsert({
    where: { username: adminUser },
    update: {
      name: adminName,
      passwordHash: adminHash,
      isActive: true,
      isSuperAdmin: false,
      mustChangeCredentials: false,
      mustChangePassword: true, // força trocar senha no primeiro login
    },
    create: {
      username: adminUser,
      name: adminName,
      passwordHash: adminHash,
      isActive: true,
      isSuperAdmin: false,
      mustChangeCredentials: false,
      mustChangePassword: true,
    },
  });

  // 3) Users chat (cria usuarios teste)
  const u1 = pickEnv('SEED_USER1_USERNAME', 'userteste1')!;
  const p1 = pickEnv('SEED_USER1_PASSWORD', 'userteste1')!;
  const n1 = pickEnv('SEED_USER1_NAME', 'Usuário Teste 1')!;

  const u2 = pickEnv('SEED_USER2_USERNAME', 'userteste2')!;
  const p2 = pickEnv('SEED_USER2_PASSWORD', 'userteste2')!;
  const n2 = pickEnv('SEED_USER2_NAME', 'Usuário Teste 2')!;

  await upsertChatUser(u1, p1, n1);
  await upsertChatUser(u2, p2, n2);

  console.log('✅ Seed OK: app_config + superadmin + adminteste + 2 users chat');
  console.log(`🔐 SuperAdmin inicial: ${superUser} / ${superPass}`);
  console.log('⚠️ SuperAdmin: no primeiro login, será obrigatório trocar user e senha.');
  console.log(`🧪 Admin teste: ${adminUser} / ${adminPass} (vai pedir troca de senha no primeiro login)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
