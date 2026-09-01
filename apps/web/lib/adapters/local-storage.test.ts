/**
 * local-storage.test.ts — runs the shared StoragePort contract against the
 * local disk adapter. Each call to `makeAdapter` gets a fresh temporary
 * directory, so tests never see another test's files.
 */
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalStorage } from './local-storage.js'
import { storageContract } from './contract/storage-contract.js'

storageContract('local disk', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'travel-diary-storage-'))
  return createLocalStorage(root)
})
