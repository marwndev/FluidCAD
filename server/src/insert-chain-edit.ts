import { createRequire } from 'module';

type TSNode = {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  startIndex: number;
  endIndex: number;
  parent: TSNode | null;
  namedChildren: TSNode[];
  namedChild(i: number): TSNode | null;
  childForFieldName(name: string): TSNode | null;
};

type TSTree = { rootNode: TSNode };

type TSParser = {
  setLanguage(lang: any): void;
  parse(code: string): TSTree;
};

async function loadTreeSitter() {
  const mod = await import('web-tree-sitter');
  return mod.default as any as {
    init(): Promise<void>;
    new(): TSParser;
    Language: { load(path: string): Promise<any> };
  };
}

let parser: TSParser | null = null;

async function getParser(): Promise<TSParser> {
  if (parser) {
    return parser;
  }
  const TreeSitter = await loadTreeSitter();
  await TreeSitter.init();
  parser = new TreeSitter();
  const requireFromHere = createRequire(import.meta.url);
  const wasmPath = requireFromHere.resolve('tree-sitter-wasms/out/tree-sitter-javascript.wasm');
  const lang = await TreeSitter.Language.load(wasmPath);
  parser.setLanguage(lang);
  return parser;
}

function* walkTree(node: TSNode): Generator<TSNode> {
  yield node;
  for (const child of node.namedChildren) {
    yield* walkTree(child);
  }
}

/**
 * The outermost call_expression starting on the resolved row — i.e. the tail
 * of the chain `insert(p).grounded().name('x')`.
 */
function findChainAt(tree: TSTree, sourceLine: number): TSNode | null {
  const row = sourceLine - 1;
  if (row < 0) {
    return null;
  }
  let best: TSNode | null = null;
  for (const node of walkTree(tree.rootNode)) {
    if (node.type !== 'call_expression') {
      continue;
    }
    if (node.startPosition.row !== row) {
      continue;
    }
    if (!best || node.endIndex > best.endIndex) {
      best = node;
    }
  }
  return best;
}

/** Walk down the chain from outermost call to base call (the `insert(p)`). */
function getChainCalls(tail: TSNode): TSNode[] {
  const chain: TSNode[] = [];
  let cur: TSNode | null = tail;
  while (cur && cur.type === 'call_expression') {
    chain.unshift(cur);
    const fn = cur.childForFieldName('function');
    if (!fn) break;
    if (fn.type === 'member_expression') {
      cur = fn.childForFieldName('object');
      continue;
    }
    break;
  }
  return chain;
}

/** Returns the base call's identifier name (e.g. "insert") if any. */
function getBaseCallName(chain: TSNode[]): string | null {
  if (chain.length === 0) return null;
  const fn = chain[0].childForFieldName('function');
  if (fn && fn.type === 'identifier') {
    return fn.text;
  }
  return null;
}

/** Find a chained call invocation by method name (e.g. `.grounded()` or `.name(...)`). */
function findMethodCall(chain: TSNode[], method: string): TSNode | null {
  for (const call of chain) {
    const fn = call.childForFieldName('function');
    if (!fn || fn.type !== 'member_expression') continue;
    const prop = fn.childForFieldName('property');
    if (prop && prop.text === method) {
      return call;
    }
  }
  return null;
}

function spliceCode(code: string, startIndex: number, endIndex: number, replacement: string): string {
  return code.slice(0, startIndex) + replacement + code.slice(endIndex);
}

/** Remove a chained method call: drops `.method(...)` from the chain. */
function removeChainCall(code: string, call: TSNode): string {
  const fn = call.childForFieldName('function');
  if (!fn || fn.type !== 'member_expression') return code;
  const object = fn.childForFieldName('object');
  if (!object) return code;
  return spliceCode(code, object.endIndex, call.endIndex, '');
}

function appendChainCall(code: string, chain: TSNode[], invocation: string): string {
  if (chain.length === 0) return code;
  const tail = chain[chain.length - 1];
  return spliceCode(code, tail.endIndex, tail.endIndex, invocation);
}

function jsString(value: string): string {
  return JSON.stringify(value);
}

export type InsertChainEdit = {
  ground?: boolean;
  /** `string` to set, `null` to drop, `undefined` to leave alone. */
  name?: string | null;
  /** Drop `.name(...)` if its value matches this default (revert-to-default). */
  defaultName?: string;
};

export type InsertChainEditResult = { newCode: string };

export async function updateInsertChain(
  code: string,
  sourceLine: number,
  edit: InsertChainEdit,
): Promise<InsertChainEditResult> {
  const p = await getParser();

  let working = code;

  // Apply ground/name on the target chain first.
  {
    const tree = p.parse(working);
    const tail = findChainAt(tree, sourceLine);
    if (!tail) {
      return { newCode: code };
    }
    const chain = getChainCalls(tail);
    if (getBaseCallName(chain) !== 'insert') {
      return { newCode: code };
    }
    working = applyEdits(working, chain, edit);
  }

  // Enforce single-ground invariant if we just set this insert as grounded.
  if (edit.ground === true) {
    working = removeGroundedFromOtherInserts(working, sourceLine, p);
  }

  return { newCode: working };
}

function applyEdits(code: string, chain: TSNode[], edit: InsertChainEdit): string {
  let working = code;

  // Operate from end of file to start so later splices don't invalidate earlier indices.
  // For the single-chain case this means: name first (it's later in chain), then ground.
  // We rebuild the chain after each edit by re-parsing, to keep node indices fresh.
  if (edit.name !== undefined) {
    working = applyName(working, chain, edit.name, edit.defaultName);
  }
  // Re-parse to refresh indices for the ground edit.
  if (edit.ground !== undefined) {
    working = applyGround(working, chain[0].startPosition.row + 1, edit.ground);
  }
  return working;
}

function applyName(
  code: string,
  chain: TSNode[],
  value: string | null,
  defaultName?: string,
): string {
  const nameCall = findMethodCall(chain, 'name');

  if (value === null || (defaultName !== undefined && value === defaultName)) {
    if (nameCall) {
      return removeChainCall(code, nameCall);
    }
    return code;
  }

  const literal = jsString(value);
  if (nameCall) {
    const args = nameCall.childForFieldName('arguments');
    if (!args) return code;
    return spliceCode(code, args.startIndex + 1, args.endIndex - 1, literal);
  }
  // Append `.name(...)` to the chain.
  return appendChainCall(code, chain, `.name(${literal})`);
}

function applyGround(code: string, sourceLine: number, ground: boolean): string {
  // Re-parse for fresh indices after a possible name edit.
  return reParseAndEdit(code, sourceLine, (chain) => {
    const groundCall = findMethodCall(chain, 'grounded');
    if (ground) {
      if (groundCall) return null;
      return appendChainCall(code, chain, '.grounded()');
    }
    if (!groundCall) return null;
    return removeChainCall(code, groundCall);
  });
}

function reParseAndEdit(
  code: string,
  sourceLine: number,
  fn: (chain: TSNode[]) => string | null,
): string {
  // Synchronous helper that uses the cached parser. Caller guarantees
  // getParser() has resolved at least once.
  if (!parser) return code;
  const tree = parser.parse(code);
  const tail = findChainAt(tree, sourceLine);
  if (!tail) return code;
  const chain = getChainCalls(tail);
  if (getBaseCallName(chain) !== 'insert') return code;
  const next = fn(chain);
  return next ?? code;
}

function removeGroundedFromOtherInserts(code: string, keepSourceLine: number, p: TSParser): string {
  const tree = p.parse(code);
  const targets: TSNode[] = [];
  for (const node of walkTree(tree.rootNode)) {
    if (node.type !== 'call_expression') continue;
    const fn = node.childForFieldName('function');
    if (!fn || fn.type !== 'member_expression') continue;
    const prop = fn.childForFieldName('property');
    if (!prop || prop.text !== 'grounded') continue;
    const chain = getChainCalls(node);
    if (getBaseCallName(chain) !== 'insert') continue;
    const baseRow = chain[0].startPosition.row + 1;
    if (baseRow === keepSourceLine) continue;
    targets.push(node);
  }
  // Splice from end to start to keep indices valid.
  targets.sort((a, b) => b.startIndex - a.startIndex);
  let working = code;
  for (const t of targets) {
    working = removeChainCall(working, t);
  }
  return working;
}
