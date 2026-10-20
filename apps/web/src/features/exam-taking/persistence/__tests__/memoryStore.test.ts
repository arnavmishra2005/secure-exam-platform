import { createMemoryStore } from '../memoryStore';
import { describeOfflineStoreContract } from './offlineStore.contract';

describeOfflineStoreContract('In-memory store', createMemoryStore);
