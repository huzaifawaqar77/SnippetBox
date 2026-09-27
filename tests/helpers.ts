import { closeDatabase, openDatabase } from '@main/db'

/** A pristine in-memory database with every migration applied. */
export function freshDatabase(): void {
  closeDatabase()
  openDatabase(':memory:')
}

export function disposeDatabase(): void {
  closeDatabase()
}
