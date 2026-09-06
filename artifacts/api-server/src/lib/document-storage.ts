import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const STUB_STORAGE_ROOT = path.join(os.tmpdir(), 'foundation-phase-one', 'uploaded-documents');

export function getStubDocumentPath(storageKey: string): string {
  return path.join(STUB_STORAGE_ROOT, storageKey);
}

export async function saveStubDocument(storageKey: string, fileBytes: Buffer): Promise<void> {
  const filePath = getStubDocumentPath(storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, fileBytes);
}

export async function readStubDocument(storageKey: string): Promise<Buffer> {
  return readFile(getStubDocumentPath(storageKey));
}