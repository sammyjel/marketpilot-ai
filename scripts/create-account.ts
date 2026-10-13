import './bootstrap';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/**
 * Creates an account from the command line and marks it verified.
 *
 * Signing up through the browser is the normal route. This exists for the two
 * cases where that is not available: the very first account on a fresh
 * deployment, and recovering access when email delivery is not yet working --
 * both of which otherwise leave an operator locked out of their own install.
 *
 * The password is read from the terminal with echo disabled rather than taken
 * as an argument, so it never reaches the shell history or the process list.
 */
async function hidden(question: string): Promise<string> {
  stdout.write(question);
  const raw = stdin.isTTY;
  if (raw) stdin.setRawMode(true);

  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk: Buffer) => {
      const char = chunk.toString('utf8');
      // Enter, or Ctrl-D on an empty line, ends input.
      if (char === '\r' || char === '\n' || char === '\u0004') {
        if (raw) stdin.setRawMode(false);
        stdin.off('data', onData);
        stdout.write('\n');
        resolve(value);
        return;
      }
      if (char === '\u0003') {
        // Ctrl-C: leave the terminal usable before exiting.
        if (raw) stdin.setRawMode(false);
        stdout.write('\n');
        process.exit(130);
      }
      if (char === '\u007f' || char === '\b') {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<void> {
  const { registerUser, verifyEmail } = await import('../src/server/services/accounts');

  const rl = createInterface({ input: stdin, output: stdout });
  const email = (await rl.question('  email: ')).trim();
  const name = (await rl.question('  your name (optional): ')).trim();
  const orgName = (await rl.question('  workspace name (optional): ')).trim();
  rl.close();

  if (!email) throw new Error('An email address is required.');

  const password = await hidden('  password (hidden, min 12 chars): ');
  const again = await hidden('  confirm password: ');
  if (password !== again) throw new Error('The two passwords did not match.');

  const result = await registerUser({
    email,
    password,
    ipAddress: '127.0.0.1',
    ...(name ? { name } : {}),
    ...(orgName ? { organizationName: orgName } : {}),
  });

  // Consume the token the registration just issued, so the account is usable
  // without waiting on an email that may not be deliverable yet.
  const verified = await verifyEmail(result.verificationToken);

  stdout.write('\n');
  stdout.write(`  account created   ${email}\n`);
  stdout.write(`  user id           ${result.userId}\n`);
  stdout.write(`  organization id   ${result.organizationId}\n`);
  stdout.write(`  email verified    ${verified ? 'yes' : 'no - verify manually'}\n`);
  stdout.write('\n  You can now sign in.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    stdout.write(`\n  failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
