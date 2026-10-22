import fs from 'node:fs/promises';
import path from 'node:path';
import * as acme from 'acme-client';

export interface Certificate {
  key: string;
  cert: string;
  notBefore: Date;
  notAfter: Date;
}

const DAY_MS = 86_400_000;
const RETRY_DELAYS = [60_000, 300_000, 1_800_000];
const RETRY_DELAY_MAX = 21_600_000;

/** True once two thirds of the certificate's lifetime have passed. */
export function shouldRenew(notBefore: Date, notAfter: Date, now: Date): boolean {
  const lifetime = notAfter.getTime() - notBefore.getTime();
  return now.getTime() >= notBefore.getTime() + (2 / 3) * lifetime;
}

export function expiryWarning(notAfter: Date, now: Date): string | null {
  const left = notAfter.getTime() - now.getTime();
  if (left <= 0) return `Certificate expired at ${notAfter.toISOString()}`;
  if (left <= 7 * DAY_MS) return `Certificate expires at ${notAfter.toISOString()}`;
  return null;
}

export function retryDelay(attempt: number): number {
  return RETRY_DELAYS[attempt] ?? RETRY_DELAY_MAX;
}

export interface CertificateManagerOptions {
  domain: string;
  email: string;
  staging: boolean;
  certDir: string;
  challenges: Map<string, string>;
}

export class CertificateManager {
  constructor(private readonly opts: CertificateManagerOptions) {}

  private file(name: string): string {
    return path.join(this.opts.certDir, name);
  }

  async load(now: Date): Promise<Certificate | null> {
    let key: string;
    let cert: string;
    try {
      cert = await fs.readFile(this.file('cert.pem'), 'utf8');
      key = await fs.readFile(this.file('key.pem'), 'utf8');
    } catch {
      return null;
    }
    try {
      const info = acme.crypto.readCertificateInfo(cert);
      const names = [info.domains.commonName, ...info.domains.altNames];
      if (!names.includes(this.opts.domain)) return null;
      if (now.getTime() >= info.notAfter.getTime()) return null;
      return { key, cert, notBefore: info.notBefore, notAfter: info.notAfter };
    } catch {
      return null;
    }
  }

  async obtain(): Promise<Certificate> {
    const { domain, email, staging, challenges } = this.opts;
    await fs.mkdir(this.opts.certDir, { recursive: true });

    let accountKey: Buffer;
    try {
      accountKey = await fs.readFile(this.file('account.key'));
    } catch {
      accountKey = await acme.crypto.createPrivateKey();
      await this.writeAtomic('account.key', accountKey);
    }

    const client = new acme.Client({
      directoryUrl: staging
        ? acme.directory.letsencrypt.staging
        : acme.directory.letsencrypt.production,
      accountKey,
    });

    const [key, csr] = await acme.crypto.createCsr({ commonName: domain });
    const cert = await client.auto({
      csr,
      email,
      termsOfServiceAgreed: true,
      challengePriority: ['http-01'],
      challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
        challenges.set(challenge.token, keyAuthorization);
      },
      challengeRemoveFn: async (_authz, challenge) => {
        challenges.delete(challenge.token);
      },
    });

    await this.writeAtomic('key.pem', key);
    await this.writeAtomic('cert.pem', cert);

    const info = acme.crypto.readCertificateInfo(cert);
    return {
      key: key.toString(),
      cert,
      notBefore: info.notBefore,
      notAfter: info.notAfter,
    };
  }

  private async writeAtomic(name: string, data: string | Buffer): Promise<void> {
    const target = this.file(name);
    const tmp = `${target}.tmp`;
    await fs.writeFile(tmp, data, { mode: 0o600 });
    await fs.rename(tmp, target);
  }
}
