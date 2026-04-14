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
	/** Limite de processos ativos no simulador (com swap: menos processos). */
	maxProcessesCap: number;
}

/** Primeiro commit: RAM 120, sem swap, teto 12 páginas. */
export const MEMORY_HARDWARE_ABUNDANT: MemoryHardwareProfile = {
	ramBlockCount: 120,
	swapBlockCount: 0,
	maxPagesPerProcessCap: 5,
	maxProcessesCap: 15,
};

/** Máximo de páginas residentes na RAM por processo com swap ligado (1 página = 5 blocos). */
export const MAX_RESIDENT_PAGES_IN_RAM_WITH_SWAP = 1;

/** Cenário restritivo: RAM pequena + swap; substituição de páginas ativa. */
export const MEMORY_HARDWARE_SWAP_CONSTRAINED: MemoryHardwareProfile = {
	ramBlockCount: 20,
	swapBlockCount: 25,
	maxPagesPerProcessCap: 1,
	maxProcessesCap: 8,
};

/** Total de molduras RAM+swap no modo com swap (derivado do perfil — única fonte para UI e validações). */
export const TOTAL_FRAMES_PHYSICAL_PLUS_SWAP =
	MEMORY_HARDWARE_SWAP_CONSTRAINED.ramBlockCount +
	MEMORY_HARDWARE_SWAP_CONSTRAINED.swapBlockCount;

export function getMemoryHardwareProfile(useSwap: boolean): MemoryHardwareProfile {
	return useSwap ? MEMORY_HARDWARE_SWAP_CONSTRAINED : MEMORY_HARDWARE_ABUNDANT;
}

export function createEmptyBoxArray(length: number): Box[] {
	return Array.from({ length }, (_, index) => ({
		process: null,
		index,
	}));
}
