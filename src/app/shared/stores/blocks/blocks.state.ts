import { State, Action, StateContext, Selector, Store } from '@ngxs/store';
import { Injectable } from '@angular/core';
import { Box } from '../../models/box';
import { BlocksAction } from './blocks.action';
import { Process } from '../../models/process';
import { BlocksScalingTypesEnum } from '../../constants/blocks-types.contants';
import {
	createEmptyBoxArray,
	getMemoryHardwareProfile,
	DEFAULT_USE_SWAP,
	MEMORY_HARDWARE_ABUNDANT,
	MEMORY_HARDWARE_SWAP_CONSTRAINED,
	MAX_RESIDENT_PAGES_IN_RAM_WITH_SWAP,
	TOTAL_FRAMES_PHYSICAL_PLUS_SWAP,
} from '../../constants/memory-simulation.constants';
import { Processes } from '../processes/processes.actions';
import { Sequence } from '../../models/sequence';

export interface BlocksStateModel {
	blocks: Box[];
	swapBlocks: Box[];
	blockScaling: BlocksScalingTypesEnum;
	allocationOrderIds: string[];
	/** Modo com swap (RAM pequena + disco) vs. RAM abundante sem eviction. */
	useSwap: boolean;
}

function buildBlocksStateInitial(useSwap: boolean): BlocksStateModel {
	const p = getMemoryHardwareProfile(useSwap);
	return {
		blocks: createEmptyBoxArray(p.ramBlockCount),
		swapBlocks: createEmptyBoxArray(p.swapBlockCount),
		blockScaling: BlocksScalingTypesEnum.FirstFit,
		allocationOrderIds: [],
		useSwap,
	};
}

export const BLOCKS_STATE_INITIAL_STATE: BlocksStateModel =
	buildBlocksStateInitial(DEFAULT_USE_SWAP);

@State<BlocksStateModel>({
	name: 'simulateOSBlocks',
	defaults: { ...BLOCKS_STATE_INITIAL_STATE },
})
@Injectable()
export class BlocksState {
	private static readonly PAGING_BLOCKS_PER_PAGE = 5;
	/** Valores >= BASE em `allocatedBlocks` referem-se a índices do vetor de swap. */
	private static readonly ALLOC_SWAP_BASE = 1_000_000;

	private encodeSwapInAlloc(swapSlotIndex: number): number {
		return BlocksState.ALLOC_SWAP_BASE + swapSlotIndex;
	}

	private isSwapAllocEntry(enc: number): boolean {
		return enc >= BlocksState.ALLOC_SWAP_BASE;
	}

	private swapIndexFromAllocEntry(enc: number): number {
		return enc - BlocksState.ALLOC_SWAP_BASE;
	}

	private isPagingAlgorithm(s: BlocksScalingTypesEnum): boolean {
		return (
			s === BlocksScalingTypesEnum.FIFO ||
			s === BlocksScalingTypesEnum.LRU ||
			s === BlocksScalingTypesEnum.NRU
		);
	}

	private getCanonicalProcess(process: Process): Process {
		try {
			const snap = this.store.snapshot() as {
				simulateOSProcesses?: { data: Process[] };
			};
			return (
				snap.simulateOSProcesses?.data?.find((p) => p.id === process.id) ??
				process
			);
		} catch {
			return process;
		}
	}

	private rebindProcessToCanonical(
		blocks: Box[],
		swapBlocks: Box[],
		process: Process
	): Process {
		const canonical = this.getCanonicalProcess(process);
		const id = canonical.id;
		for (let i = 0; i < blocks.length; i++) {
			if (blocks[i].process?.id === id) {
				blocks[i].process = canonical;
			}
		}
		for (let i = 0; i < swapBlocks.length; i++) {
			if (swapBlocks[i].process?.id === id) {
				swapBlocks[i].process = canonical;
			}
		}
		return canonical;
	}

	private maxLogicalPageCount(process: Process): number {
		return Math.max(
			1,
			Math.ceil(
				process.memoryBlocksRequired / BlocksState.PAGING_BLOCKS_PER_PAGE
			)
		);
	}

	private clampLogicalPageNumber(process: Process, page: number): number {
		const max = this.maxLogicalPageCount(process);
		return Math.min(Math.max(1, page), max);
	}

	private clearPageAllocationHistoryIfFirstPlacement(
		proc: Process,
		blocks: Box[],
		swapBlocks: Box[]
	): void {
		const pid = proc.id;
		const inRam = blocks.some((b) => b.process?.id === pid);
		const inSwap = swapBlocks.some((b) => b.process?.id === pid);
		if (!inRam && !inSwap) {
			proc.pageAllocationHistory = [];
		}
	}

	private countRamBlocksForProcessId(blocks: Box[], pid: string): number {
		return blocks.filter((b) => b.process?.id === pid).length;
	}

	/**
	 * Move um bloco RAM do processo para o swap (prioriza o último na ordem lógica de allocatedBlocks)
	 * para liberar slot antes de trazer bloco do swap.
	 */
	private moveOneRamBlockOfProcessToSwapPreferTail(
		blocks: Box[],
		swapBlocks: Box[],
		process: Process
	): boolean {
		const proc = this.rebindProcessToCanonical(blocks, swapBlocks, process);
		const ramEntries = (proc.allocatedBlocks || []).filter(
			(e) => !this.isSwapAllocEntry(e)
		);
		if (ramEntries.length === 0) {
			return false;
		}
		const ramBlockIndexToSwap = ramEntries[ramEntries.length - 1];
		return this.moveToSwap(blocks, swapBlocks, ramBlockIndexToSwap);
	}

	constructor(private store: Store) {
		this.loadStateFromLocalStorage();
		window.addEventListener(
			'storage',
			this.syncStateFromLocalStorage.bind(this)
		);
	}

	@Selector()
	static getBlocks(state: BlocksStateModel) {
		return state.blocks;
	}

	@Selector()
	static getSwapBlocks(state: BlocksStateModel) {
		return state.swapBlocks;
	}

	@Selector()
	static getSequences(state: BlocksStateModel): Sequence[] {
		const blocks = state.blocks;
		const sequences: Sequence[] = [];
		let currentSequence: Sequence | null = null;

		for (let i = 0; i < blocks.length; i++) {
			if (!blocks[i].process) {
				if (currentSequence) {
					currentSequence.length++;
				} else {
					currentSequence = { start: i, length: 1 };
				}
			} else if (currentSequence) {
				sequences.push(currentSequence);
				currentSequence = null;
			}
		}

		if (currentSequence) {
			sequences.push(currentSequence);
		}

		return sequences;
	}

	@Selector()
	static getBlocksLength(state: BlocksStateModel): number {
		return state.blocks.length;
	}

	@Selector()
	static getOccupiedBlocksLength(state: BlocksStateModel): number {
		return state.blocks.filter((block) => block.process !== null).length;
	}

	@Selector()
	static getFreeBlocksLength(state: BlocksStateModel): number {
		return state.blocks.filter((block) => block.process === null).length;
	}

	@Selector()
	static getBlocksByProcessId(state: BlocksStateModel) {
		return (processId: string) =>
			state.blocks
				.map((block, index) => ({ block, index }))
				.filter(({ block }) => block.process?.id === processId)
				.map(({ index }) => index);
	}

	@Selector()
	static getBlockScaling(state: BlocksStateModel) {
		return state.blockScaling;
	}

	@Selector()
	static getUseSwap(state: BlocksStateModel): boolean {
		return state.useSwap;
	}

	@Selector()
	static getMaxPagesPerProcessCap(state: BlocksStateModel): number {
		return state.useSwap
			? MEMORY_HARDWARE_SWAP_CONSTRAINED.maxPagesPerProcessCap
			: MEMORY_HARDWARE_ABUNDANT.maxPagesPerProcessCap;
	}

	@Selector()
	static getMaxProcessesCap(state: BlocksStateModel): number {
		return getMemoryHardwareProfile(state.useSwap).maxProcessesCap;
	}

	@Action(BlocksAction.AllocateBlocks)
	allocateBlocks(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();
		const blocks = [...state.blocks];
		const swapBlocks = [...state.swapBlocks];
		const { memoryBlocksRequired } = action.payload;
		const isPaging = this.isPagingAlgorithm(state.blockScaling);

		const ramFree = blocks.filter((block) => !block.process).length;
		const swapFree = state.useSwap
			? swapBlocks.filter((block) => !block.process).length
			: 0;
		const totalFree = ramFree + swapFree;
		const totalCap = blocks.length + swapBlocks.length;

		if (state.useSwap) {
			if (totalFree < memoryBlocksRequired) {
				console.log(
					`Memória insuficiente: não há molduras livres na RAM+swap (${TOTAL_FRAMES_PHYSICAL_PLUS_SWAP} no total).`
				);
				return;
			}
			if (totalCap !== TOTAL_FRAMES_PHYSICAL_PLUS_SWAP) {
				console.warn(
					`Esperado ${TOTAL_FRAMES_PHYSICAL_PLUS_SWAP} molduras no modo swap; há ${totalCap}.`
				);
			}
		} else if (isPaging) {
			if (blocks.length < memoryBlocksRequired) {
				console.log(
					'Memória insuficiente: o processo exige mais blocos do que a RAM física.'
				);
				return;
			}
		} else if (ramFree < memoryBlocksRequired) {
			console.log('Memória insuficiente');
			return;
		}

		this.runMemoryBlockScaling(context, action);
		this.saveStateToLocalStorage(context.getState());
	}

	@Action(BlocksAction.BringToPhysicalMemory)
	bringToPhysicalMemory(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.BringToPhysicalMemory
	) {
		const state = context.getState();
		const blocks = state.blocks.map(b => ({ ...b }));
		const swapBlocks = state.swapBlocks.map(b => ({ ...b }));
		const process = this.rebindProcessToCanonical(blocks, swapBlocks, action.process);
		let allocationOrderIds = [...state.allocationOrderIds];

		const hasRam = blocks.some((b) => b.process?.id === process.id);

		const indicesInSwap = swapBlocks
			.map((box, index) => (box.process?.id === process.id ? index : -1))
			.filter((idx) => idx !== -1);

		if (indicesInSwap.length === 0) {
			if (hasRam) {
				blocks.forEach((b) => {
					if (b.process?.id === process.id) {
						b.process.referenced = true;
						b.process.lastAccessed = performance.now();
					}
				});
				context.patchState({ blocks });
			}
			return;
		}

		if (!state.useSwap) {
			console.warn(
				`Processo ${process.id} no swap com modo sem swap; ignorando traga para RAM.`
			);
			return;
		}

		const maxRamBlocks =
			MAX_RESIDENT_PAGES_IN_RAM_WITH_SWAP *
			BlocksState.PAGING_BLOCKS_PER_PAGE;

		indicesInSwap.forEach((swapIdx) => {
			let procRef = this.rebindProcessToCanonical(blocks, swapBlocks, process);
			while (
				this.countRamBlocksForProcessId(blocks, procRef.id) >
				maxRamBlocks - 1
			) {
				if (
					!this.moveOneRamBlockOfProcessToSwapPreferTail(
						blocks,
						swapBlocks,
						procRef
					)
				) {
					break;
				}
				procRef = this.rebindProcessToCanonical(blocks, swapBlocks, process);
			}

			const moved = this.moveToPhysical(
				blocks,
				swapBlocks,
				swapIdx,
				state.blockScaling,
				allocationOrderIds
			);

			if (!moved) {
				console.error('Falha ao mover: RAM e SWAP cheios.');
			}
		});

		if (!allocationOrderIds.includes(process.id)) {
			allocationOrderIds.push(process.id);
		}

		context.patchState({ blocks, swapBlocks, allocationOrderIds });
	}

	@Action(BlocksAction.ClearReferenceBits)
	clearReferenceBits(context: StateContext<BlocksStateModel>) {
		const state = context.getState();

		// Shallow-copy boxes but keep the same Process references as ProcessesState so
		// swap flags stay aligned with the page table (it reads processes from data).
		const blocks = state.blocks.map((box) => ({ ...box }));
		blocks.forEach((box) => {
			if (box.process) {
				box.process.referenced = false;
			}
		});

		const swapBlocks = state.swapBlocks.map((box) => ({ ...box }));
		swapBlocks.forEach((box) => {
			if (box.process) {
				box.process.referenced = false;
			}
		});

		context.patchState({
			blocks,
			swapBlocks,
		});
	}

	runFirstFit(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();
		const blocks = [...state.blocks];
		const { process, memoryBlocksRequired } = action.payload || {};
		if (!process || !memoryBlocksRequired) {
			// Exibir um erro ou retornar, pois os dados esperados estão faltando
			return;
		}
		const emptyBlocksLength = blocks.filter((block) => !block.process).length;

		if (emptyBlocksLength < memoryBlocksRequired) {
			// Memória insuficiente
			return;
		}

		let allocated = false;

		for (let i = 0; i <= blocks.length - memoryBlocksRequired; i++) {
			const canAllocate = blocks
				.slice(i, i + memoryBlocksRequired)
				.every((block) => !block.process);

			if (canAllocate) {
				for (let j = 0; j < memoryBlocksRequired; j++) {
					blocks[i + j] = { process, index: i + j }; // Registrando o índice do bloco
				}
				allocated = true;
				process.allocatedBlocks = blocks
					.slice(i, i + memoryBlocksRequired)
					.map((block) => block.index); // Guardando os índices dos blocos alocados no processo
				break;
			}
		}

		if (!allocated) {
			// Memória insuficiente ou fragmentada
			return;
		}

		context.patchState({ blocks });
	}

	runBestFit(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();
		const blocks = [...state.blocks];
		const { process, memoryBlocksRequired } = action.payload || {};
		if (!process || !memoryBlocksRequired) {
			// Exibir um erro ou retornar, pois os dados esperados estão faltando
			return;
		}
		const emptyBlocksLength = blocks.filter((block) => !block.process).length;

		if (emptyBlocksLength < memoryBlocksRequired) {
			// Memória insuficiente
			return;
		}

		let bestFitIndex = -1;
		let bestFitSize = Number.MAX_SAFE_INTEGER;

		let currentFreeIndex = -1;
		let currentFreeSize = 0;

		for (let i = 0; i < blocks.length; i++) {
			if (!blocks[i].process) {
				if (currentFreeSize === 0) {
					currentFreeIndex = i;
				}
				currentFreeSize++;
			} else {
				if (
					currentFreeSize >= memoryBlocksRequired &&
					currentFreeSize < bestFitSize
				) {
					bestFitIndex = currentFreeIndex;
					bestFitSize = currentFreeSize;
				}
				currentFreeSize = 0;
			}
		}

		// Verificar se o último bloco livre é o melhor ajuste
		if (
			currentFreeSize >= memoryBlocksRequired &&
			currentFreeSize < bestFitSize
		) {
			bestFitIndex = currentFreeIndex;
			bestFitSize = currentFreeSize;
		}

		if (bestFitIndex === -1) {
			// Memória insuficiente ou fragmentada
			return;
		}

		// Alocar o processo no bloco encontrado
		for (let i = 0; i < memoryBlocksRequired; i++) {
			blocks[bestFitIndex + i] = { process, index: bestFitIndex + i }; // Adicionando índice do bloco
		}
		process.allocatedBlocks = blocks
			.slice(bestFitIndex, bestFitIndex + memoryBlocksRequired)
			.map((block) => block.index); // Guardando os índices dos blocos alocados no processo

		context.patchState({ blocks });
	}

	runWorstFit(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();
		const blocks = [...state.blocks];
		const { process, memoryBlocksRequired } = action.payload || {};
		if (!process || !memoryBlocksRequired) {
			// Exibir um erro ou retornar, pois os dados esperados estão faltando
			return;
		}
		const emptyBlocksLength = blocks.filter((block) => !block.process).length;

		if (emptyBlocksLength < memoryBlocksRequired) {
			// Memória insuficiente
			return;
		}

		let worstFitIndex = -1;
		let worstFitSize = 0;

		let currentFreeIndex = -1;
		let currentFreeSize = 0;

		for (let i = 0; i < blocks.length; i++) {
			if (!blocks[i].process) {
				if (currentFreeSize === 0) {
					currentFreeIndex = i;
				}
				currentFreeSize++;
			} else {
				if (
					currentFreeSize >= memoryBlocksRequired &&
					currentFreeSize > worstFitSize
				) {
					worstFitIndex = currentFreeIndex;
					worstFitSize = currentFreeSize;
				}
				currentFreeSize = 0;
			}
		}

		// Verificar se o último bloco livre é o pior ajuste
		if (
			currentFreeSize >= memoryBlocksRequired &&
			currentFreeSize > worstFitSize
		) {
			worstFitIndex = currentFreeIndex;
			worstFitSize = currentFreeSize;
		}

		if (worstFitIndex === -1) {
			// Memória insuficiente ou fragmentada
			return;
		}

		// Alocar o processo no bloco encontrado
		for (let i = 0; i < memoryBlocksRequired; i++) {
			blocks[worstFitIndex + i] = { process, index: worstFitIndex + i }; // Adicionando índice do bloco
		}
		process.allocatedBlocks = blocks
			.slice(worstFitIndex, worstFitIndex + memoryBlocksRequired)
			.map((block) => block.index); // Guardando os índices dos blocos alocados no processo

		context.patchState({ blocks });
	}

	private appendPageLocationEvent(
		process: Process,
		pageNumber: number,
		location: 'physical' | 'swap',
		blockIndices: number[]
	): void {
		const target = this.getCanonicalProcess(process);
		const page = this.clampLogicalPageNumber(target, pageNumber);
		if (!target.pageAllocationHistory) {
			target.pageAllocationHistory = [];
		}
		const h = target.pageAllocationHistory;
		const nextSeq =
			h.length === 0 ? 1 : Math.max(...h.map((e) => e.sequence)) + 1;
		h.push({ sequence: nextSeq, pageNumber: page, location, blockIndices });
		if (target !== process) {
			process.pageAllocationHistory = h;
		}
	}

	/** Logical page (5 blocos por página). `kind` indica se o índice é de RAM ou slot de swap. */
	private pageNumberForAllocatedBlockIndex(
		process: Process,
		slotIndex: number,
		kind: 'ram' | 'swap'
	): number {
		const canonical = this.getCanonicalProcess(process);
		const alloc = canonical.allocatedBlocks || [];
		let pos = -1;
		if (kind === 'ram') {
			pos = alloc.findIndex(
				(e) => !this.isSwapAllocEntry(e) && e === slotIndex
			);
		} else {
			pos = alloc.findIndex(
				(e) =>
					this.isSwapAllocEntry(e) &&
					this.swapIndexFromAllocEntry(e) === slotIndex
			);
		}
		if (pos < 0) {
			return this.clampLogicalPageNumber(canonical, 1);
		}
		const raw =
			Math.floor(pos / BlocksState.PAGING_BLOCKS_PER_PAGE) + 1;
		return this.clampLogicalPageNumber(canonical, raw);
	}

	private recordInitialPhysicalPages(
		process: Process,
		memoryBlocksRequired: number
	): void {
		this.recordInitialPagePlacements(process, memoryBlocksRequired);
	}

	/** Histórico inicial com páginas em RAM e/ou swap (modo com swap). */
	private recordInitialPagePlacements(
		process: Process,
		memoryBlocksRequired: number
	): void {
		const alloc = process.allocatedBlocks || [];
		const numPages = Math.ceil(
			memoryBlocksRequired / BlocksState.PAGING_BLOCKS_PER_PAGE
		);
		for (let p = 1; p <= numPages; p++) {
			const slice = alloc.slice(
				(p - 1) * BlocksState.PAGING_BLOCKS_PER_PAGE,
				p * BlocksState.PAGING_BLOCKS_PER_PAGE
			);
			const ramIdx: number[] = [];
			const swapIdx: number[] = [];
			for (const enc of slice) {
				if (this.isSwapAllocEntry(enc)) {
					swapIdx.push(this.swapIndexFromAllocEntry(enc));
				} else {
					ramIdx.push(enc);
				}
			}
			if (swapIdx.length > 0 && ramIdx.length === 0) {
				this.appendPageLocationEvent(process, p, 'swap', swapIdx);
			} else {
				this.appendPageLocationEvent(process, p, 'physical', ramIdx);
			}
		}
	}

	private moveToSwap(
		blocks: Box[],
		swapBlocks: Box[],
		blockIndexToSwap: number
	): boolean {
		if (swapBlocks.length === 0) {
			return false;
		}

		const freeSwapIndex = swapBlocks.findIndex(b => b.process === null);

		if (freeSwapIndex === -1) {
			console.error('Memória SWAP cheia! Não é possível realizar a troca.');
			return false;
		}

		const raw = blocks[blockIndexToSwap].process;
		if (!raw) {
			return false;
		}
		const proc = this.rebindProcessToCanonical(blocks, swapBlocks, raw);
		const pageNum = this.pageNumberForAllocatedBlockIndex(
			proc,
			blockIndexToSwap,
			'ram'
		);
		this.appendPageLocationEvent(proc, pageNum, 'swap', [freeSwapIndex]);

		swapBlocks[freeSwapIndex].process = proc;

		if (swapBlocks[freeSwapIndex].process) {
			swapBlocks[freeSwapIndex].process!.swap = true;
		}

		blocks[blockIndexToSwap].process = null;

		if (proc.allocatedBlocks?.length) {
			const i = proc.allocatedBlocks.findIndex(
				(e) => !this.isSwapAllocEntry(e) && e === blockIndexToSwap
			);
			if (i >= 0) {
				proc.allocatedBlocks[i] = this.encodeSwapInAlloc(freeSwapIndex);
			}
		}

		return true;
	}

	private moveBlocksToSwap(
    blocks: Box[],
    swapBlocks: Box[],
    blockIndexToSwap: number
	): boolean {
		if (swapBlocks.length === 0) {
			return false;
		}

		const rawVictim = blocks[blockIndexToSwap].process;
		if (!rawVictim){
			return false;
		}
		const victimProcess = this.rebindProcessToCanonical(
			blocks,
			swapBlocks,
			rawVictim
		);

		const processId = victimProcess.id;

		const physicalIndices = blocks
			.map((b, i) => (b.process?.id === processId ? i : -1))
			.filter(i => i !== -1);

		const blocksToMoveCount = physicalIndices.length;

		const freeSwapIndices = swapBlocks
			.map((b, i) => (b.process === null ? i : -1))
			.filter(i => i !== -1);

		if (freeSwapIndices.length < blocksToMoveCount) {
			return false;
		}

		const newSwapIndices: number[] = [];

		physicalIndices.forEach((physIdx, iteration) => {
			const pageNum = this.pageNumberForAllocatedBlockIndex(
				victimProcess,
				physIdx,
				'ram'
			);
			const targetSwapIdx = freeSwapIndices[iteration];
			this.appendPageLocationEvent(
				victimProcess,
				pageNum,
				'swap',
				[targetSwapIdx]
			);

			swapBlocks[targetSwapIdx].process = blocks[physIdx].process;
			newSwapIndices.push(targetSwapIdx);
			blocks[physIdx].process = null;
		});

		const movedProcess = swapBlocks[newSwapIndices[0]].process;
		if (movedProcess) {
			movedProcess.allocatedBlocks = newSwapIndices.map((i) =>
				this.encodeSwapInAlloc(i)
			);
			movedProcess.swap = true;
		}

		return true;
	}

	private moveToPhysical(
		blocks: Box[],
		swapBlocks: Box[],
		swapIndexToMove: number,
		algorithm: BlocksScalingTypesEnum,
		allocationOrderIds: string[]
	): boolean {
		let freePhysicalIndex = blocks.findIndex(b => b.process === null);

		if (freePhysicalIndex === -1) {
			const victimIndex = this.getVictimBlockIndex(blocks, algorithm, allocationOrderIds);

			if (victimIndex !== -1) {
				const victimProcess = blocks[victimIndex].process;
				const movedToSwap = this.moveBlocksToSwap(blocks, swapBlocks, victimIndex);
				if (!movedToSwap){
					return false;
				} 

				if (victimProcess) {
                    const idIndex = allocationOrderIds.indexOf(victimProcess.id);
                    if (idIndex > -1) {
                        allocationOrderIds.splice(idIndex, 1);
                    }
                }
				
				freePhysicalIndex = victimIndex;
			} else {
				return false;
			}
		}

		const rawTarget = swapBlocks[swapIndexToMove].process;
		if (!rawTarget) return false;

		const targetProcess = this.rebindProcessToCanonical(
			blocks,
			swapBlocks,
			rawTarget
		);

		const pageNum = this.pageNumberForAllocatedBlockIndex(
			targetProcess,
			swapIndexToMove,
			'swap'
		);
		this.appendPageLocationEvent(targetProcess, pageNum, 'physical', [
			freePhysicalIndex,
		]);

		targetProcess.lastAccessed = performance.now();

		targetProcess.swap = false;

		targetProcess.referenced = true;

		blocks[freePhysicalIndex] = { ...blocks[freePhysicalIndex], process: targetProcess };

		if (targetProcess.allocatedBlocks) {
			targetProcess.allocatedBlocks = targetProcess.allocatedBlocks
				.filter((enc) => {
					if (this.isSwapAllocEntry(enc)) {
						return (
							this.swapIndexFromAllocEntry(enc) !== swapIndexToMove
						);
					}
					return true;
				})
				.concat(freePhysicalIndex);
		}

		swapBlocks[swapIndexToMove].process = null;

		return true;
	}

	private getVictimBlockIndex(
		blocks: Box[], 
		algorithm: BlocksScalingTypesEnum,
		allocationOrderIds: string[]
	): number {
		const occupiedIndices = blocks
			.map((b, i) => b.process !== null ? i : -1)
			.filter(i => i !== -1);

		if (occupiedIndices.length === 0) return -1;

		const processesInMemory = Array.from(
			new Set(occupiedIndices.map(i => blocks[i].process!))
		);

		let victimProcess: Process | undefined;

		switch (algorithm) {
			case BlocksScalingTypesEnum.FIFO:
				const firstInId = allocationOrderIds[0];
                victimProcess = processesInMemory.find(p => p.id === firstInId);
                break;

			case BlocksScalingTypesEnum.LRU:
				victimProcess = processesInMemory.sort((a, b) => 
					(a.lastAccessed || 0) - (b.lastAccessed || 0)
				)[0];
				break;

			case BlocksScalingTypesEnum.NRU:
                const class0: Process[] = []; 
                const class1: Process[] = []; 
                const class2: Process[] = []; 
                const class3: Process[] = []; 

                processesInMemory.forEach(p => {
                    const r = p.referenced || false;
                    const m = p.modified || false;
                    if (!r && !m) class0.push(p);
                    else if (!r && m) class1.push(p);
                    else if (r && !m) class2.push(p);
                    else class3.push(p);
                });

                const targetClass = class0.length > 0 ? class0 :
                                    class1.length > 0 ? class1 :
                                    class2.length > 0 ? class2 :
                                    class3;

                const randomIdx = Math.floor(Math.random() * targetClass.length);
                victimProcess = targetClass[randomIdx];
                break;

			default:
				victimProcess = processesInMemory.sort((a, b) => a.timeCreated - b.timeCreated)[0];
				break;
		}

		return blocks.findIndex(b => b.process?.id === victimProcess?.id);
	}

	private evictEntireProcessFromRam(
		blocks: Box[],
		swapBlocks: Box[],
		processId: string,
		allocationOrderIds: string[]
	): void {
		let sample: Process | null = null;
		for (let i = 0; i < blocks.length; i++) {
			if (blocks[i].process?.id === processId) {
				sample = blocks[i].process!;
				break;
			}
		}
		if (sample) {
			const canon = this.rebindProcessToCanonical(blocks, swapBlocks, sample);
			canon.allocatedBlocks = [];
			canon.swap = false;
		}
		for (let i = 0; i < blocks.length; i++) {
			if (blocks[i].process?.id === processId) {
				blocks[i] = { process: null, index: blocks[i].index };
			}
		}
		const oi = allocationOrderIds.indexOf(processId);
		if (oi > -1) {
			allocationOrderIds.splice(oi, 1);
		}
	}

	/**
	 * Com swap: no máximo 1 página na RAM por processo; demais blocos no swap.
	 * Substituição de molduras RAM usa FIFO/LRU/NRU até liberar slots necessários na RAM.
	 */
	private allocatePagingWithSwapResidentLimit(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks,
		variant: 'fifo' | 'lru' | 'nru'
	): void {
		const state = context.getState();
		const blocks = [...state.blocks];
		const swapBlocks = [...state.swapBlocks];
		let allocationOrderIds = [...(state.allocationOrderIds || [])];
		const { process, memoryBlocksRequired } = action.payload || {};

		if (!process || !memoryBlocksRequired) {
			console.error('Processo ou quantidade de blocos necessários ausentes.');
			return;
		}

		const proc = this.rebindProcessToCanonical(blocks, swapBlocks, process);
		this.clearPageAllocationHistoryIfFirstPlacement(proc, blocks, swapBlocks);

		const ramSlotsNeeded = Math.min(
			BlocksState.PAGING_BLOCKS_PER_PAGE,
			memoryBlocksRequired
		);
		const swapSlotsNeeded = memoryBlocksRequired - ramSlotsNeeded;

		const refreshEmptyRam = () =>
			blocks
				.map((block, index) => ({ block, index }))
				.filter(({ block }) => !block.process);

		let emptyBlocks = refreshEmptyRam();

		if (variant === 'fifo') {
			while (
				emptyBlocks.length < ramSlotsNeeded &&
				allocationOrderIds.length > 0
			) {
				const victimProcessId = allocationOrderIds[0];
				const occupiedIndices = blocks
					.map((b, i) => (b.process?.id === victimProcessId ? i : -1))
					.filter((i) => i !== -1);
				for (const idx of occupiedIndices) {
					if (!this.moveToSwap(blocks, swapBlocks, idx)) {
						console.warn('SWAP cheio durante a migração FIFO.');
						break;
					}
				}
				const removedId = allocationOrderIds.shift();
				console.log(`Processo ${removedId} (FIFO): páginas para SWAP.`);
				emptyBlocks = refreshEmptyRam();
			}
		} else if (variant === 'lru') {
			while (emptyBlocks.length < ramSlotsNeeded) {
				const occupiedIndices = blocks
					.map((b, i) => (b.process ? i : -1))
					.filter((i) => i !== -1);
				if (occupiedIndices.length === 0) {
					break;
				}
				const processesInMemory = Array.from(
					new Set(occupiedIndices.map((i) => blocks[i].process!))
				);
				const victimProcess = processesInMemory.sort(
					(a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0)
				)[0];
				if (!victimProcess) {
					break;
				}
				const victimIndices = blocks
					.map((b, i) => (b.process?.id === victimProcess.id ? i : -1))
					.filter((i) => i !== -1);
				for (const idx of victimIndices) {
					if (!this.moveToSwap(blocks, swapBlocks, idx)) {
						console.warn('SWAP cheio durante a migração LRU.');
						break;
					}
				}
				const idIndex = allocationOrderIds.indexOf(victimProcess.id);
				if (idIndex > -1) {
					allocationOrderIds.splice(idIndex, 1);
				}
				emptyBlocks = refreshEmptyRam();
			}
		} else {
			while (emptyBlocks.length < ramSlotsNeeded) {
				const occupiedIndices = blocks
					.map((b, i) => (b.process ? i : -1))
					.filter((i) => i !== -1);
				if (occupiedIndices.length === 0) {
					break;
				}
				const processesInMemory = Array.from(
					new Set(occupiedIndices.map((i) => blocks[i].process!))
				);
				const class0: Process[] = [];
				const class1: Process[] = [];
				const class2: Process[] = [];
				const class3: Process[] = [];
				processesInMemory.forEach((p) => {
					const r = p.referenced || false;
					const m = p.modified || false;
					if (!r && !m) {
						class0.push(p);
					} else if (!r && m) {
						class1.push(p);
					} else if (r && !m) {
						class2.push(p);
					} else {
						class3.push(p);
					}
				});
				const targetClass =
					class0.length > 0
						? class0
						: class1.length > 0
							? class1
							: class2.length > 0
								? class2
								: class3;
				if (targetClass.length === 0) {
					break;
				}
				const victimProcess =
					targetClass[Math.floor(Math.random() * targetClass.length)];
				const victimIndices = blocks
					.map((b, i) => (b.process?.id === victimProcess.id ? i : -1))
					.filter((i) => i !== -1);
				for (const idx of victimIndices) {
					if (!this.moveToSwap(blocks, swapBlocks, idx)) {
						console.warn('SWAP cheio durante a migração NRU.');
						break;
					}
				}
				const idIndex = allocationOrderIds.indexOf(victimProcess.id);
				if (idIndex > -1) {
					allocationOrderIds.splice(idIndex, 1);
				}
				emptyBlocks = refreshEmptyRam();
			}
		}

		if (emptyBlocks.length < ramSlotsNeeded) {
			console.error(
				'Memória física insuficiente para residentes (modo com swap, 1 página na RAM).'
			);
			return;
		}

		const swapFreeIndices = swapBlocks
			.map((b, i) => (b.process === null ? i : -1))
			.filter((i) => i !== -1);
		if (swapFreeIndices.length < swapSlotsNeeded) {
			console.error('Swap insuficiente para o restante dos blocos do processo.');
			return;
		}

		emptyBlocks = emptyBlocks.sort(() => Math.random() - 0.5);
		const chosenRam = emptyBlocks
			.slice(0, ramSlotsNeeded)
			.map((e) => e.index);
		const shuffledSwapFree = swapFreeIndices.sort(() => Math.random() - 0.5);
		const chosenSwap = shuffledSwapFree.slice(0, swapSlotsNeeded);

		const alloc: number[] = [];
		let ramI = 0;
		let swI = 0;
		for (let b = 0; b < memoryBlocksRequired; b++) {
			if (b < ramSlotsNeeded) {
				const idx = chosenRam[ramI++];
				blocks[idx] = { process: proc, index: idx };
				alloc.push(idx);
			} else {
				const sidx = chosenSwap[swI++];
				swapBlocks[sidx] = { process: proc, index: sidx };
				alloc.push(this.encodeSwapInAlloc(sidx));
			}
		}

		proc.allocatedBlocks = alloc;
		proc.swap = swapSlotsNeeded > 0;

		if (variant === 'lru') {
			proc.lastAccessed = performance.now();
		}
		if (variant === 'nru') {
			proc.referenced = true;
		}

		allocationOrderIds.push(proc.id);
		this.recordInitialPagePlacements(proc, memoryBlocksRequired);
		context.patchState({ blocks, swapBlocks, allocationOrderIds });
		console.log(
			`Paginação com swap: RAM ${ramSlotsNeeded} blocos, swap ${swapSlotsNeeded}. Alloc:`,
			alloc
		);
	}

	/**
	 * Sem swap: RAM ampla; se cheia, desaloca processos inteiros (FIFO/LRU/NRU) para liberar molduras.
	 */
	private runPagingAllocateRamOnly(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks,
		variant: 'fifo' | 'lru' | 'nru'
	): void {
		const state = context.getState();
		const blocks = [...state.blocks];
		const swapBlocks = [...state.swapBlocks];
		let allocationOrderIds = [...(state.allocationOrderIds || [])];
		const { process, memoryBlocksRequired } = action.payload || {};

		if (!process || !memoryBlocksRequired) {
			console.error('Processo ou quantidade de blocos necessários ausentes.');
			return;
		}

		const proc = this.rebindProcessToCanonical(blocks, swapBlocks, process);
		this.clearPageAllocationHistoryIfFirstPlacement(proc, blocks, swapBlocks);

		const refreshEmptyRam = () =>
			blocks
				.map((block, index) => ({ block, index }))
				.filter(({ block }) => !block.process);

		let emptyBlocks = refreshEmptyRam();

		while (emptyBlocks.length < memoryBlocksRequired) {
			const vidx = this.getVictimBlockIndex(
				blocks,
				state.blockScaling,
				allocationOrderIds
			);
			if (vidx < 0) {
				break;
			}
			const vid = blocks[vidx].process?.id;
			if (!vid) {
				break;
			}
			this.evictEntireProcessFromRam(
				blocks,
				swapBlocks,
				vid,
				allocationOrderIds
			);
			emptyBlocks = refreshEmptyRam();
		}

		if (emptyBlocks.length < memoryBlocksRequired) {
			console.error(
				'Memória física insuficiente no modo sem swap (após desalocar processos).'
			);
			return;
		}

		emptyBlocks = emptyBlocks.sort(() => Math.random() - 0.5);

		for (let i = 0; i < memoryBlocksRequired; i++) {
			const { index: blockIndex } = emptyBlocks[i];
			blocks[blockIndex] = { process: proc, index: blockIndex };
		}

		proc.allocatedBlocks = blocks
			.filter((block) => block.process?.id === proc.id)
			.map((block) => block.index);

		if (variant === 'lru') {
			proc.lastAccessed = performance.now();
		}
		if (variant === 'nru') {
			proc.referenced = true;
		}

		allocationOrderIds.push(proc.id);
		this.recordInitialPhysicalPages(proc, memoryBlocksRequired);
		context.patchState({ blocks, swapBlocks, allocationOrderIds });
	}

	private runFIFO(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();

		if (!state.useSwap) {
			this.runPagingAllocateRamOnly(context, action, 'fifo');
			return;
		}

		this.allocatePagingWithSwapResidentLimit(context, action, 'fifo');
	}

	private runLRU(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();

		if (!state.useSwap) {
			this.runPagingAllocateRamOnly(context, action, 'lru');
			return;
		}

		this.allocatePagingWithSwapResidentLimit(context, action, 'lru');
	}

	private runNRU(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();

		if (!state.useSwap) {
			this.runPagingAllocateRamOnly(context, action, 'nru');
			return;
		}

		this.allocatePagingWithSwapResidentLimit(context, action, 'nru');
	}


	@Action(BlocksAction.ReleaseBlocks)
	releaseBlocks(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.ReleaseBlocks
	) {
		const { blocks, swapBlocks, allocationOrderIds } = context.getState();
		const targetId = action.payload.id;

		const idsToRemove = new Set<string>([targetId]);

		const newBlocks = blocks.map((block) => {
			if (
				block.process?.state === 'finished' ||
				block.process?.id === targetId
			) {
				if (block.process?.id) {
                    idsToRemove.add(block.process.id);
                }
				return { process: null, index: block.index }; // Manter o índice do bloco
			} else {
				return block; // Manter o bloco como está
			}
		});

		const newSwapBlocks = swapBlocks.map((block) => {
			if (
				block.process?.state === 'finished' ||
				block.process?.id === targetId
			) {
				return { process: null, index: block.index };
			}
			return block;
		});

		const currentOrderIds = allocationOrderIds || [];
        const newAllocationOrderIds = currentOrderIds.filter(id => !idsToRemove.has(id));

		context.patchState({ 
            blocks: newBlocks, 
            swapBlocks: newSwapBlocks,
            allocationOrderIds: newAllocationOrderIds 
        });

		this.saveStateToLocalStorage(context.getState());
	}

	@Action(BlocksAction.ReleaseBlockById)
	releaseBlockById(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.ReleaseBlockById
	) {
		const { blocks, swapBlocks } = context.getState();
		const idToRelease = action.id;

		// Atualiza os blocos, liberando aquele que tem o ID correspondente
		const newBlocks = blocks.map((block) => {
			if (block.process?.id === idToRelease) {
				return { process: null, index: block.index }; // Manter o índice do bloco
			}
			return block; // Manter o bloco como está
		});

		const newSwapBlocks = swapBlocks.map((block) => {
			if (block.process?.id === idToRelease) {
				return { process: null, index: block.index };
			}
			return block;
		});

		context.patchState({ blocks: newBlocks, swapBlocks: newSwapBlocks });
		this.saveStateToLocalStorage(context.getState());
	}

	@Action(BlocksAction.ResetState)
	resetState(context: StateContext<BlocksStateModel>) {
		const { blockScaling, useSwap } = context.getState();
		const fresh = buildBlocksStateInitial(useSwap);
		context.patchState({
			blocks: fresh.blocks,
			swapBlocks: fresh.swapBlocks,
			allocationOrderIds: [],
			useSwap,
			blockScaling,
		});
		this.saveStateToLocalStorage(context.getState());
	}

	@Action(BlocksAction.SetUseSwap)
	setUseSwap(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.SetUseSwap
	) {
		if (context.getState().useSwap === action.useSwap) {
			return;
		}
		context.patchState({ useSwap: action.useSwap });
		context.dispatch(new Processes.StopProcesses());
		this.saveStateToLocalStorage(context.getState());
	}

	@Action(BlocksAction.PickBlockScalingType)
	pickBlockScalingType(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.PickBlockScalingType
	) {
		context.patchState({
			blockScaling: action.scalingType,
		});

		context.dispatch(new Processes.StopProcesses());
		this.runMemoryBlockScaling(context, action);
		this.saveStateToLocalStorage(context.getState());
	}
	private runMemoryBlockScaling(
		context: StateContext<BlocksStateModel>,
		action: any
	): void {
		const { blockScaling } = context.getState();

		switch (blockScaling) {
			case BlocksScalingTypesEnum.BestFit:
				this.runBestFit(context, action);
				break;
			case BlocksScalingTypesEnum.FirstFit:
				this.runFirstFit(context, action);
				break;
			case BlocksScalingTypesEnum.WorstFit:
				this.runWorstFit(context, action);
				break;
			case BlocksScalingTypesEnum.FIFO:
				this.runFIFO(context, action);
				break;
			case BlocksScalingTypesEnum.LRU:
				this.runLRU(context, action);
				break;
			case BlocksScalingTypesEnum.NRU:
				this.runNRU(context, action);
				break;
			default:
				break;
		}
		this.saveStateToLocalStorage(context.getState());
	}
	private saveStateToLocalStorage(state: BlocksStateModel) {
		localStorage.setItem('simulateOSBlocks', JSON.stringify(state));
	}

	private normalizeBlocksStateFromStorage(
		parsed: Partial<BlocksStateModel> | null
	): BlocksStateModel {
		if (!parsed || typeof parsed !== 'object') {
			return buildBlocksStateInitial(DEFAULT_USE_SWAP);
		}
		const storedUseSwap =
			typeof parsed.useSwap === 'boolean' ? parsed.useSwap : DEFAULT_USE_SWAP;
		const profile = getMemoryHardwareProfile(storedUseSwap);
		const fresh = buildBlocksStateInitial(storedUseSwap);
		const sameLayout =
			Array.isArray(parsed.blocks) &&
			parsed.blocks.length === profile.ramBlockCount &&
			Array.isArray(parsed.swapBlocks) &&
			parsed.swapBlocks.length === profile.swapBlockCount;
		if (!sameLayout) {
			return {
				...fresh,
				blockScaling: parsed.blockScaling ?? fresh.blockScaling,
			};
		}
		return {
			...fresh,
			...parsed,
			blocks: parsed.blocks as Box[],
			swapBlocks: parsed.swapBlocks as Box[],
			useSwap: storedUseSwap,
			allocationOrderIds: parsed.allocationOrderIds ?? [],
			blockScaling: parsed.blockScaling ?? fresh.blockScaling,
		};
	}

	private loadStateFromLocalStorage() {
		const localStorageState = localStorage.getItem('simulateOSBlocks');
		if (localStorageState) {
			try {
				const parsed = JSON.parse(localStorageState) as Partial<BlocksStateModel>;
				const merged = this.normalizeBlocksStateFromStorage(parsed);
				this.store.reset({
					...this.store.snapshot(),
					simulateOSBlocks: merged,
				});
			} catch {
				/* ignore */
			}
		}
	}

	private syncStateFromLocalStorage(event: StorageEvent) {
		if (event.key === 'simulateOSBlocks') {
			try {
				const localStorageState = JSON.parse(event.newValue || '{}');
				const merged = this.normalizeBlocksStateFromStorage(localStorageState);
				this.store.reset({
					...this.store.snapshot(),
					simulateOSBlocks: merged,
				});
			} catch {
				/* ignore */
			}
		}
	}
}
