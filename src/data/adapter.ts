import type { AnyDoc, CollectionName, DataSet } from '../types'

// Camada de dados abstrata. Duas implementações intermutáveis:
// - LocalAdapter: IndexedDB, 100% offline, default sem código de espaço.
// - FirebaseAdapter: Firestore em tempo real, partilhado via código de espaço.

export interface DataAdapter {
  // Carrega tudo e subscreve alterações. O callback é chamado com o dataset
  // completo sempre que qualquer coleção muda (incluindo alterações remotas).
  start(onChange: (data: DataSet) => void): Promise<void>
  stop(): void
  put(collection: CollectionName, doc: AnyDoc): Promise<void>
  putMany(collection: CollectionName, docs: AnyDoc[]): Promise<void>
  remove(collection: CollectionName, id: string): Promise<void>
  // Snapshot atual (para migração local -> espaço)
  snapshot(): DataSet
  isEmpty(): boolean
}
