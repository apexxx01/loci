// Evaluate the JS in .tmp/eval.js inside the app frame and print the JSON result.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function run({ frame, page, workspaceRoot }) {
  const code = readFileSync(join(workspaceRoot, '.tmp/eval.js'), 'utf8');
  const target = frame ?? page;
  const result = await target.evaluate(`(async () => { ${code} })()`);
  console.log('__RESULT__' + JSON.stringify(result));
  return result;
}
