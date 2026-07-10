import { openDB, type IDBPDatabase } from 'idb'
import type { AnyDoc, CollectionName, DataSet } from '../types'
import { COLLECTIONS, emptyDataSet } from '../types'
import type { DataAdapter } from './adapter'

const DB_NAME = 'contas'
const DB_VERSION = 2

export class LocalAdapter implements DataAdapter {
  private db: IDBPDatabase | null = null
  private data: DataSet = emptyDataSet()
  private onChange: ((data: DataSet) => void) | null = null

  async start(onChange: (data: DataSet) => void): Promise<void> {
    this.onChange = onChange
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of COLLECTIONS) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' })
          }
        }
      },
    })
    const data = emptyDataSet()
    for (const name of COLLECTIONS) {
      data[name] = (await this.db.getAll(name)) as never
    }
    this.data = data
    this.emit()
  }

  stop(): void {
    this.db?.close()
    this.db = null
    this.onChange = null
  }

  private emit() {
    this.onChange?.({ ...this.data })
  }

  async put(collection: CollectionName, doc: AnyDoc): Promise<void> {
    await this.db!.put(collection, doc)
    const list = this.data[collection] as AnyDoc[]
    const idx = list.findIndex((d) => d.id === doc.id)
    if (idx >= 0) list[idx] = doc
    else list.push(doc)
    this.data = { ...this.data, [collection]: [...list] }
    this.emit()
  }

  async putMany(collection: CollectionName, docs: AnyDoc[]): Promise<void> {
    const tx = this.db!.transaction(collection, 'readwrite')
    await Promise.all(docs.map((d) => tx.store.put(d)))
    await tx.done
    const list = [...(this.data[collection] as AnyDoc[])]
    for (const doc of docs) {
      const idx = list.findIndex((d) => d.id === doc.id)
      if (idx >= 0) list[idx] = doc
      else list.push(doc)
    }
    this.data = { ...this.data, [collection]: list }
    this.emit()
  }

  async remove(collection: CollectionName, id: string): Promise<void> {
    await this.db!.delete(collection, id)
    this.data = {
      ...this.data,
      [collection]: (this.data[collection] as AnyDoc[]).filter((d) => d.id !== id),
    }
    this.emit()
  }

  async clear(): Promise<void> {
    for (const name of COLLECTIONS) {
      await this.db!.clear(name)
    }
    this.data = emptyDataSet()
    this.emit()
  }

  snapshot(): DataSet {
    return this.data
  }

  isEmpty(): boolean {
    return COLLECTIONS.every((c) => this.data[c].length === 0)
  }
}
