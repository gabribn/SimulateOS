import { ProcessStatesType } from '../constants/process-states.constants';
import { ProcessTypesType } from '../constants/process-types.constants';

/** One placement of a logical page (FIFO/LRU/NRU), in simulation order. */
export interface PageAllocationHistoryEntry {
	sequence: number;
	pageNumber: number;
	location: 'physical' | 'swap';
	/** Índices dos blocos na RAM ou no SWAP conforme o evento. */
	blockIndices?: number[];
}

export interface Process {
	id: string;
	priority: number;
	color: string;
	type: ProcessTypesType;
	state: ProcessStatesType;
	cpuTime: number;
	timeCreated: number;
	timeDeleted?: number;
	processTimeToFinish: number;
	executingTime: number;
	currentType: ProcessTypesType;
	memoryBlocksRequired: number;
	allocatedBlocks?: number[];
	pages: {pageNumber: number}[];
	lastAccessed?: number;
	swap?: boolean;
	referenced?: boolean;
    modified?: boolean;
	pageAllocationHistory?: PageAllocationHistoryEntry[];
	/** Usado pelo diálogo de edição / localStorage; opcional no modelo. */
	isAvailable?: boolean;
}

export interface CreateProcessDTO {
	priority: number;
	color: string;
	type: ProcessTypesType;
	number?: number;
	state?: ProcessStatesType;
	timeCreated?: number;
	processTimeToFinish: number;
	memoryBlocksRequired: number;
	allocatedBlocks?: number[];
	pages: {pageNumber: number}[];
}
