import { ProcessStatesType } from '../constants/process-states.constants';
import { ProcessTypesType } from '../constants/process-types.constants';

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
