import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../src/auth';

const rl = createInterface({ input: process.stdin, output: process.stderr });
const answer = await rl.question('Password: ');
rl.close();
console.log(await hashPassword(answer));
