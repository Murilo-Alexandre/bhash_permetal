import { ConfigService } from '@nestjs/config';

export const DEV_JWT_SECRET = 'dev-secret-change-me';

export function getOptionalJwtSecret(config: ConfigService) {
  const value = config.get<string>('JWT_SECRET')?.trim();
  return value || DEV_JWT_SECRET;
}

export function getRequiredJwtSecret(config: ConfigService) {
  const value = config.get<string>('JWT_SECRET')?.trim();
  if (!value) {
    throw new Error('JWT_SECRET não definido no .env');
  }
  return value;
}

