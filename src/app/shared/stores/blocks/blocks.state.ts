import { State, Action, StateContext, Selector, Store } from '@ngxs/store';
import { Injectable } from '@angular/core';
import { Box } from '../../models/box';
import { BlocksAction } from './blocks.action';
import { Process } from '../../models/process';
import { BlocksScalingTypesEnum } from '../../constants/blocks-types.contants';
import { Processes } from '../processes/processes.actions';
import { Sequence } from '../../models/sequence';

export interface BlocksStateModel {
	blocks: Box[];
	swapBlocks: Box[];
	blockScaling: BlocksScalingTypesEnum;
	allocationOrderIds: string[];
}

export const BLOCKS_STATE_INITIAL_STATE: BlocksStateModel = {
	blocks: Array.from({ length: 20 }, (_, index) => ({
		process: null,
		index: index,
	})),
	swapBlocks: Array.from({ length: 20 }, (_, index) => ({
		process: null,
		index: index,
	})),
	blockScaling: BlocksScalingTypesEnum.FirstFit,
	allocationOrderIds: [],
};

@State<BlocksStateModel>({
	name: 'simulateOSBlocks',
	defaults: { ...BLOCKS_STATE_INITIAL_STATE },
})
@Injectable()
export class BlocksState {
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

	@Action(BlocksAction.AllocateBlocks)
	allocateBlocks(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();
		const blocks = [...state.blocks];
		const swapBlocks = [...state.swapBlocks]
		const { memoryBlocksRequired } = action.payload;

		const emptyBlocksLength = blocks.filter((block) => !block.process).length + swapBlocks.filter((block) => !block.process).length;

		if (emptyBlocksLength < memoryBlocksRequired) {
			console.log("Memória insuficiente")
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
		const process = action.process;
		let allocationOrderIds = [...state.allocationOrderIds];

		const isAlreadyInPhysicalMemory = blocks.some(b => b.process?.id === process.id);

		if (isAlreadyInPhysicalMemory) {
			console.log(`Processo ${process.id} já está na memória física.`);
			blocks.forEach(b => {
                if (b.process?.id === process.id) {
                    b.process = {
                        ...b.process,
                        referenced: true,
                        lastAccessed: performance.now() 
                    };
                }
            });

            context.patchState({ blocks });
			return;
		}

		const indicesInSwap = swapBlocks
			.map((box, index) => (box.process?.id === process.id ? index : -1))
			.filter(idx => idx !== -1);

		if (indicesInSwap.length > 0) {
			indicesInSwap.forEach(swapIdx => {
				const moved = this.moveToPhysical(
					blocks, 
					swapBlocks, 
					swapIdx, 
					state.blockScaling,
					allocationOrderIds
				);
				
				if (!moved) {
					console.error("Falha ao mover: RAM e SWAP cheios.");
				}
			});

			if (!allocationOrderIds.includes(process.id)) {
                allocationOrderIds.push(process.id);
            }

			context.patchState({ blocks, swapBlocks, allocationOrderIds });
		}
	}

	@Action(BlocksAction.ClearReferenceBits)
    clearReferenceBits(context: StateContext<BlocksStateModel>) {
        const state = context.getState();
        
        const updatedBlocks = state.blocks.map(box => {
            if (box.process) {
                return {
                    ...box, 
                    process: {
                        ...box.process, 
                        referenced: false
                    }
                };
            }
            return box; 
        });

        const updatedSwapBlocks = state.swapBlocks.map(box => {
            if (box.process) {
                return {
                    ...box,
                    process: {
                        ...box.process,
                        referenced: false
                    }
                };
            }
            return box;
        });

        context.patchState({ 
            blocks: updatedBlocks,
            swapBlocks: updatedSwapBlocks
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

	private moveToSwap(
		blocks: Box[],
		swapBlocks: Box[],
		blockIndexToSwap: number
	): boolean {
		const freeSwapIndex = swapBlocks.findIndex(b => b.process === null);

		if (freeSwapIndex === -1) {
			console.error('Memória SWAP cheia! Não é possível realizar a troca.');
			return false;
		}

		swapBlocks[freeSwapIndex].process = blocks[blockIndexToSwap].process;

		if (swapBlocks[freeSwapIndex].process) {
			swapBlocks[freeSwapIndex].process!.swap = true;
		}

		blocks[blockIndexToSwap].process = null;

		return true;
	}

	private moveBlocksToSwap(
    blocks: Box[],
    swapBlocks: Box[],
    blockIndexToSwap: number
	): boolean {
		const victimProcess = blocks[blockIndexToSwap].process;
		if (!victimProcess){
			return false;
		} 

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
			const targetSwapIdx = freeSwapIndices[iteration];
			swapBlocks[targetSwapIdx].process = blocks[physIdx].process;
			newSwapIndices.push(targetSwapIdx);
			blocks[physIdx].process = null;
		});

		const movedProcess = swapBlocks[newSwapIndices[0]].process;
		if (movedProcess) {
			movedProcess.allocatedBlocks = newSwapIndices;
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

		const targetProcess = swapBlocks[swapIndexToMove].process;
		if (!targetProcess) return false;

		targetProcess.lastAccessed = performance.now();

		targetProcess.swap = false;

		targetProcess.referenced = true;

		blocks[freePhysicalIndex] = { ...blocks[freePhysicalIndex], process: targetProcess };

		if (targetProcess.allocatedBlocks) {
			targetProcess.allocatedBlocks = targetProcess.allocatedBlocks
				.filter(idx => idx !== swapIndexToMove)
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
				if(!victimProcess){
					debugger;
				}
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

	private runFIFO(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();
		const blocks = [...state.blocks];
		const swapBlocks = [...state.swapBlocks];
		let allocationOrderIds = [...(state.allocationOrderIds || [])];

		const { process, memoryBlocksRequired } = action.payload || {};

		if (!process || !memoryBlocksRequired) {
			console.error('Processo ou quantidade de blocos necessários ausentes.');
			return;
		}

		// Criar lista de blocos vazios
		let emptyBlocks = blocks
			.map((block, index) => ({ block, index }))
			.filter(({ block }) => !block.process);

		while (emptyBlocks.length < memoryBlocksRequired && allocationOrderIds.length > 0) {
			const victimProcessId = allocationOrderIds[0];

			const occupiedIndices = blocks
				.map((b, i) => (b.process?.id === victimProcessId ? i : -1))
				.filter(i => i !== -1);

			let freedCount = 0;

			for (const idx of occupiedIndices) {
				const moved = this.moveToSwap(blocks, swapBlocks, idx);
				if (moved) {
					emptyBlocks.push({ block: blocks[idx], index: idx });
					freedCount++;
				} else {
					console.warn("SWAP cheio durante a migração FIFO.");
					break;
				}
			}

			const removedId = allocationOrderIds.shift();
            console.log(`Processo ${removedId} movido para SWAP.`);
		}

		if (emptyBlocks.length < memoryBlocksRequired) {
			console.error('Memória Física e SWAP insuficientes.');
			return;
		}


		// Embaralhar a lista de blocos vazios para evitar alocação contígua
		emptyBlocks = emptyBlocks.sort(() => Math.random() - 0.5);

		// Alocar blocos não contiguamente para o processo
		for (let i = 0; i < memoryBlocksRequired; i++) {
			const { index: blockIndex } = emptyBlocks[i];
			blocks[blockIndex] = { process, index: blockIndex }; // Aloca o bloco
		}

		// Guardar os índices dos blocos alocados para este processo
		process.allocatedBlocks = blocks
			.filter((block) => block.process?.id === process.id)
			.map((block) => block.index);

		allocationOrderIds.push(process.id);

		// Atualizar o estado global com os novos blocos alocados
		context.patchState({ blocks, swapBlocks, allocationOrderIds });
		console.log(`Blocos alocados via FIFO com SWAP: ${process.allocatedBlocks}`);
	}

	private runLRU(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();
		const blocks = [...state.blocks];
		const swapBlocks = [...state.swapBlocks];
		const { process, memoryBlocksRequired } = action.payload || {};

		let allocationOrderIds = [...(state.allocationOrderIds || [])];

		if (!process || !memoryBlocksRequired) {
			return;
		}

		let emptyBlocks = blocks
			.map((block, index) => ({ block, index }))
			.filter(({ block }) => !block.process);

		while (emptyBlocks.length < memoryBlocksRequired) {
			const occupiedIndices = blocks
				.map((b, i) => (b.process ? i : -1))
				.filter(i => i !== -1);

			if (occupiedIndices.length === 0) {
				break;
			}

			const processesInMemory = Array.from(
				new Set(occupiedIndices.map(i => blocks[i].process!))
			);

			const victimProcess = processesInMemory.sort((a, b) => 
				(a.lastAccessed || 0) - (b.lastAccessed || 0)
			)[0];

			if (!victimProcess) break; 

			console.log(`Vítima LRU escolhida: ${victimProcess.id} (Último acesso: ${victimProcess.lastAccessed})`);

			const victimIndices = blocks
				.map((b, i) => (b.process?.id === victimProcess.id ? i : -1))
				.filter(i => i !== -1);

			for (const idx of victimIndices) {
				const moved = this.moveToSwap(blocks, swapBlocks, idx);
				if (moved) {
					emptyBlocks.push({ block: blocks[idx], index: idx });
				} else {
					console.warn("SWAP cheio durante a migração LRU.");
					break; 
				}
			}

			const idIndex = allocationOrderIds.indexOf(victimProcess.id);
			if (idIndex > -1) {
				allocationOrderIds.splice(idIndex, 1);
			}
		}

		if (emptyBlocks.length < memoryBlocksRequired) {
			console.error('Memória Física e SWAP insuficientes.');
			return;
		}

		emptyBlocks = emptyBlocks.sort(() => Math.random() - 0.5);

		for (let i = 0; i < memoryBlocksRequired; i++) {
			const { index: blockIndex } = emptyBlocks[i];
			blocks[blockIndex] = { process, index: blockIndex };
		}

		process.allocatedBlocks = blocks
			.filter((block) => block.process?.id === process.id)
			.map((block) => block.index);

		process.lastAccessed = performance.now();
		allocationOrderIds.push(process.id);

		context.patchState({ blocks, swapBlocks, allocationOrderIds });
    	console.log(`Blocos alocados via LRU: ${process.allocatedBlocks}`);
	}

	private runNRU(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();
		const blocks = [...state.blocks];
		const swapBlocks = [...state.swapBlocks];
		const { process, memoryBlocksRequired } = action.payload || {};
		let allocationOrderIds = [...(state.allocationOrderIds || [])];

		if (!process || !memoryBlocksRequired) {
			console.error('Processo ou quantidade de blocos necessários ausentes.');
			return;
		}

		let emptyBlocks = blocks
			.map((block, index) => ({ block, index }))
			.filter(({ block }) => !block.process);

		while (emptyBlocks.length < memoryBlocksRequired) {
			const occupiedIndices = blocks
				.map((b, i) => (b.process ? i : -1))
				.filter(i => i !== -1);

			if (occupiedIndices.length === 0) break;

			const processesInMemory = Array.from(
				new Set(occupiedIndices.map(i => blocks[i].process!))
			);

			const class0: any[] = []; 
			const class1: any[] = []; 
			const class2: any[] = []; 
			const class3: any[] = []; 

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

			if (targetClass.length === 0) break;

			const randomIndex = Math.floor(Math.random() * targetClass.length);
			const victimProcess = targetClass[randomIndex];

			const victimIndices = blocks
				.map((b, i) => (b.process?.id === victimProcess.id ? i : -1))
				.filter(i => i !== -1);

			for (const idx of victimIndices) {
				const moved = this.moveToSwap(blocks, swapBlocks, idx);
				if (moved) {
					emptyBlocks.push({ block: blocks[idx], index: idx });
				} else {
					console.warn("SWAP cheio durante a migração NRU.");
					break; 
				}
			}

			const idIndex = allocationOrderIds.indexOf(victimProcess.id);
			if (idIndex > -1) {
				allocationOrderIds.splice(idIndex, 1);
			}
		}

		if (emptyBlocks.length < memoryBlocksRequired) {
			console.error('Memória Física e SWAP insuficientes mesmo após remoção por NRU.');
			return;
		}

		emptyBlocks = emptyBlocks.sort(() => Math.random() - 0.5);

		process.referenced = true;

		let allocatedBlocks: number[] = [];
		for (let i = 0; i < memoryBlocksRequired; i++) {
			const { index: blockIndex } = emptyBlocks[i];
			blocks[blockIndex] = { process, index: blockIndex };
			allocatedBlocks.push(blockIndex);
		}

		process.allocatedBlocks = allocatedBlocks;
		
		allocationOrderIds.push(process.id);

		context.patchState({ blocks, swapBlocks, allocationOrderIds });
		console.log(`Processo ${process.id} alocado. Blocos: ${allocatedBlocks}`);
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
		context.patchState({
			blocks: BLOCKS_STATE_INITIAL_STATE.blocks,
			swapBlocks: BLOCKS_STATE_INITIAL_STATE.swapBlocks
		});
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

	private loadStateFromLocalStorage() {
		const localStorageState = localStorage.getItem('simulateOSBlocks');
		if (localStorageState) {
			this.store.reset({
				...this.store.snapshot(),
				simulateOSBlocks: JSON.parse(localStorageState),
			});
		}
	}

	private syncStateFromLocalStorage(event: StorageEvent) {
		if (event.key === 'simulateOSBlocks') {
			const localStorageState = JSON.parse(event.newValue || '{}');
			if (localStorageState) {
				this.store.reset({
					...this.store.snapshot(),
					simulateOSBlocks: localStorageState,
				});
			}
		}
	}
}
