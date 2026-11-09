import { createReadStream } from "node:fs";
import readline from "node:readline";

export interface DiffResult {
  removed: string[];
  addedCount: number;
}

async function* lines(filePath: string): AsyncGenerator<string> {
  const rl = readline.createInterface({ input: createReadStream(filePath, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line) yield line;
  }
}

/**
 * Classic sorted-merge diff between two sorted-unique-domain snapshot files.
 * Memory use is O(1) beyond the current line of each stream (never loads a
 * whole snapshot into memory). `removed` = present in previous, absent in
 * current (i.e. zone_diff drops); `addedCount` = present in current, absent
 * in previous.
 */
export async function diffSnapshots(previousPath: string, currentPath: string): Promise<DiffResult> {
  const prevIter = lines(previousPath)[Symbol.asyncIterator]();
  const currIter = lines(currentPath)[Symbol.asyncIterator]();

  let prev = await prevIter.next();
  let curr = await currIter.next();
  const removed: string[] = [];
  let addedCount = 0;

  while (!prev.done && !curr.done) {
    if (prev.value === curr.value) {
      prev = await prevIter.next();
      curr = await currIter.next();
    } else if (prev.value < curr.value) {
      removed.push(prev.value);
      prev = await prevIter.next();
    } else {
      addedCount += 1;
      curr = await currIter.next();
    }
  }
  while (!prev.done) {
    removed.push(prev.value);
    prev = await prevIter.next();
  }
  while (!curr.done) {
    addedCount += 1;
    curr = await currIter.next();
  }

  return { removed, addedCount };
}
