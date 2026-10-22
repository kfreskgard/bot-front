import crypto from 'node:crypto';
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

acme.axios.defaults.timeout = 30_000;

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
      const names = [info.domains.commonName, ...info.domains.altNames]
        .filter((n): n is string => typeof n === 'string')
        .map((n) => n.toLowerCase());
      if (!names.includes(this.opts.domain.toLowerCase())) return null;
      if (now.getTime() >= info.notAfter.getTime()) return null;
      const pair = new crypto.X509Certificate(cert).checkPrivateKey(crypto.createPrivateKey(key));
      if (!pair) return null;
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
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      accountKey = await acme.crypto.createPrivateKey();
      await this.commit(await this.stage('account.key', accountKey));
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
      skipChallengeVerification: true,
      challengeCreateFn: async (_authz, challenge, keyAuthorization) => {
        challenges.set(challenge.token, keyAuthorization);
      },
      challengeRemoveFn: async (_authz, challenge) => {
        challenges.delete(challenge.token);
      },
    });

    // Stage both files first so the window between the two renames is minimal;
    // load() rejects a mismatched pair, which makes the next start re-obtain.
    const keyStaged = await this.stage('key.pem', key);
    const certStaged = await this.stage('cert.pem', cert);
    await this.commit(keyStaged);
    await this.commit(certStaged);

    const info = acme.crypto.readCertificateInfo(cert);
    return {
      key: key.toString(),
      cert,
      notBefore: info.notBefore,
      notAfter: info.notAfter,
    };
  }

  private async stage(name: string, data: string | Buffer): Promise<{ tmp: string; target: string }> {
    const target = this.file(name);
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, data, { mode: 0o600 });
    return { tmp, target };
  }

  private async commit(staged: { tmp: string; target: string }): Promise<void> {
    await fs.rename(staged.tmp, staged.target);
  }
}
