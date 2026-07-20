import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import AppDataSource from './data-source';
import { UserEntity } from '../auth/infrastructure/persistence/relational/entities/user.entity';

async function seed() {
  console.log('[Seed] Initializing database connection...');
  await AppDataSource.initialize();

  try {
    const userRepo = AppDataSource.getRepository(UserEntity);

    const adminUsername = process.env.ADMIN_USERNAME?.trim();
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();
    const adminEmail =
      process.env.ADMIN_EMAIL?.trim() ||
      (adminUsername ? `${adminUsername}@battleship.local` : '');

    if (!adminUsername || !adminPassword) {
      console.log(
        '[Seed] ADMIN_USERNAME or ADMIN_PASSWORD environment variable not set. Skipping admin seed.',
      );
      return;
    }

    const existingAdminCount = await userRepo.count({
      where: { role: 'ADMIN' },
    });
    if (existingAdminCount > 0) {
      console.log(
        '[Seed] An admin account already exists in the database. Skipping seed.',
      );
      return;
    }

    const existingByEmail = await userRepo.findOne({
      where: { email: adminEmail },
    });
    if (existingByEmail) {
      console.warn(
        `[Seed] Cannot seed admin: email "${adminEmail}" already exists.`,
      );
      return;
    }

    const existingByUsername = await userRepo.findOne({
      where: { username: adminUsername },
    });
    if (existingByUsername) {
      console.warn(
        `[Seed] Cannot seed admin: username "${adminUsername}" already exists.`,
      );
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const adminUser = userRepo.create({
      id: randomUUID(),
      email: adminEmail,
      username: adminUsername,
      passwordHash,
      role: 'ADMIN',
      elo: 800,
      avatar: null,
      signature: null,
      bannedUntil: null,
      bannedPermanent: false,
      banReason: null,
      bannedAt: null,
      banActorId: null,
      lastBanAction: null,
      unbannedAt: null,
      unbanActorId: null,
      refreshTokenHash: null,
      refreshTokenAbsoluteExpiry: null,
    });

    await userRepo.save(adminUser);
    console.log(
      `[Seed] Successfully created initial admin account: ${adminUsername} (${adminEmail})`,
    );
  } catch (error) {
    console.error('[Seed] Error occurred during seeding:', error);
    process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
    console.log('[Seed] Database connection closed.');
  }
}

void seed();
