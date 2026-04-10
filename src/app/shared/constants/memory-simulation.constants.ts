import { Box } from '../models/box';
import { BlocksScalingTypesEnum } from './blocks-types.contants';

/**
 * Valor inicial ao carregar o app (antes do localStorage / UI).
 * O modo efetivo fica em `simulateOSBlocks.useSwap` e pode ser alterado no diálogo de criar processo.
 */
export const DEFAULT_USE_SWAP = true;

export interface MemoryHardwareProfile {
	ramBlockCount: number;
	swapBlockCount: number;
	/** Teto no diálogo de criação (modo FIFO/LRU/NRU), alinhado ao histórico do Git. */
	maxPagesPerProcessCap: number;
}

/** Primeiro commit: RAM 120, sem swap, teto 12 páginas. */
export const MEMORY_HARDWARE_ABUNDANT: MemoryHardwareProfile = {
	ramBlockCount: 120,
	swapBlockCount: 0,
	maxPagesPerProcessCap: 12,
};

/** Total de molduras RAM+swap (40) no modo com swap. */
export const TOTAL_FRAMES_PHYSICAL_PLUS_SWAP = 40;

/** Máximo de páginas residentes na RAM por processo com swap ligado (1 página = 5 blocos). */
export const MAX_RESIDENT_PAGES_IN_RAM_WITH_SWAP = 1;

/** Cenário restritivo: RAM 20 + swap 20 = 40 molduras; substituição de páginas ativa. */
export const MEMORY_HARDWARE_SWAP_CONSTRAINED: MemoryHardwareProfile = {
	ramBlockCount: 20,
	swapBlockCount: 20,
	maxPagesPerProcessCap: 24,
};

export function getMemoryHardwareProfile(useSwap: boolean): MemoryHardwareProfile {
	return useSwap ? MEMORY_HARDWARE_SWAP_CONSTRAINED : MEMORY_HARDWARE_ABUNDANT;
}

export function createEmptyBoxArray(length: number): Box[] {
	return Array.from({ length }, (_, index) => ({
		process: null,
		index,
	}));
}
