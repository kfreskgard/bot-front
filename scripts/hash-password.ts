import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../src/auth';

const rl = createInterface({ input: process.stdin, output: process.stderr });
const answer = await rl.question('Password: ');
rl.close();
// Only a trailing line break is dropped; spaces belong to the password.
const password = answer.replace(/\r?\n$/, '');
if (password === '') {
  console.error('Refusing to hash an empty password.');
  process.exit(1);
}
console.log(await hashPassword(password));
