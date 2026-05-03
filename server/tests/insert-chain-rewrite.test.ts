import { describe, it, expect } from 'vitest';
import { updateInsertChain } from '../src/insert-chain-edit.ts';

describe('updateInsertChain', () => {
  it('adds .grounded() to a bare insert', async () => {
    const code = `insert(p);\n`;
    const result = await updateInsertChain(code, 1, { ground: true });
    expect(result.newCode).toBe(`insert(p).grounded();\n`);
  });

  it('preserves existing chain when adding .grounded()', async () => {
    const code = `insert(p).name('foo');\n`;
    const result = await updateInsertChain(code, 1, { ground: true });
    expect(result.newCode).toBe(`insert(p).name('foo').grounded();\n`);
  });

  it('removes .grounded() when ground is false', async () => {
    const code = `insert(p).grounded();\n`;
    const result = await updateInsertChain(code, 1, { ground: false });
    expect(result.newCode).toBe(`insert(p);\n`);
  });

  it('adds .name(value) to a bare insert', async () => {
    const code = `insert(p);\n`;
    const result = await updateInsertChain(code, 1, { name: 'foo' });
    expect(result.newCode).toBe(`insert(p).name("foo");\n`);
  });

  it('replaces an existing .name(...) literal', async () => {
    const code = `insert(p).name('old');\n`;
    const result = await updateInsertChain(code, 1, { name: 'new' });
    expect(result.newCode).toBe(`insert(p).name("new");\n`);
  });

  it('drops .name() when value matches the part default', async () => {
    const code = `insert(p).name('housing');\n`;
    const result = await updateInsertChain(code, 1, { name: 'housing', defaultName: 'housing' });
    expect(result.newCode).toBe(`insert(p);\n`);
  });

  it('drops .name() when value is null', async () => {
    const code = `insert(p).name('foo');\n`;
    const result = await updateInsertChain(code, 1, { name: null });
    expect(result.newCode).toBe(`insert(p);\n`);
  });

  it('one-ground invariant: setting ground on one removes it from all others', async () => {
    const code = [
      `insert(a).grounded();`,
      `insert(b);`,
      ``,
    ].join('\n');
    const result = await updateInsertChain(code, 2, { ground: true });
    expect(result.newCode).toBe(
      [`insert(a);`, `insert(b).grounded();`, ``].join('\n'),
    );
  });

  it('idempotent: re-applying the same ground=true is a no-op', async () => {
    const code = `insert(p).grounded();\n`;
    const result = await updateInsertChain(code, 1, { ground: true });
    expect(result.newCode).toBe(code);
  });

  it('idempotent: re-applying the same name is a no-op (modulo quote style)', async () => {
    const code = `insert(p).name("foo");\n`;
    const result = await updateInsertChain(code, 1, { name: 'foo' });
    expect(result.newCode).toBe(code);
  });

  it('combined name + ground in one call', async () => {
    const code = `insert(p);\n`;
    const result = await updateInsertChain(code, 1, { name: 'foo', ground: true });
    expect(result.newCode).toBe(`insert(p).name("foo").grounded();\n`);
  });

  it('does nothing when source line does not contain insert(...)', async () => {
    const code = `const x = 1;\n`;
    const result = await updateInsertChain(code, 1, { ground: true });
    expect(result.newCode).toBe(code);
  });
});
