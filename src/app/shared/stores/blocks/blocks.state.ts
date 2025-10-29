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
	blockScaling: BlocksScalingTypesEnum;
}

export const BLOCKS_STATE_INITIAL_STATE: BlocksStateModel = {
	blocks: Array.from({ length: 120 }, (_, index) => ({
		process: null,
		index: index,
	})),
	blockScaling: BlocksScalingTypesEnum.FirstFit,
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
		const { memoryBlocksRequired } = action.payload;

		const emptyBlocksLength = blocks.filter((block) => !block.process).length;

		if (emptyBlocksLength < memoryBlocksRequired) {
			// Memória insuficiente
			return;
		}
		this.runMemoryBlockScaling(context, action);
		this.saveStateToLocalStorage(context.getState());
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

	private runFIFO(
    context: StateContext<BlocksStateModel>,
    action: BlocksAction.AllocateBlocks
) {
    const state = context.getState();
    const blocks = [...state.blocks];
    const { process, memoryBlocksRequired } = action.payload || {};
    if (!process || !memoryBlocksRequired) {
        console.error('Processo ou quantidade de blocos necessários ausentes.');
        return;
    }

    // Criar lista de blocos vazios
    let emptyBlocks = blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => !block.process);

    // Se não houver blocos suficientes, liberar páginas mais antigas (FIFO)
    if (emptyBlocks.length < memoryBlocksRequired) {
        const allProcesses = blocks
            .filter(block => block.process !== null && block.process !== undefined)
            .map(block => block.process!)
            .sort((a, b) => a.timeCreated - b.timeCreated); // Ordena processos por ordem de chegada

        while (emptyBlocks.length < memoryBlocksRequired && allProcesses.length > 0) {
            const oldestProcess = allProcesses.shift(); // Processo mais antigo
            if (oldestProcess) {
                blocks.forEach((block, index) => {
                    if (block.process?.id === oldestProcess.id) {
                        blocks[index].process = null; // Libera o bloco
                        emptyBlocks.push({ block: blocks[index], index }); // Adiciona o bloco liberado aos vazios
                    }
                });
            }
        }

        if (emptyBlocks.length < memoryBlocksRequired) {
            console.error('Memória insuficiente após liberar com FIFO.');
            return;
        }
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

    // Atualizar o estado global com os novos blocos alocados
    context.patchState({ blocks });
    console.log(`Blocos alocados via FIFO: ${process.allocatedBlocks}`);
}

	private runLRU(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.AllocateBlocks
	) {
		const state = context.getState();
		const blocks = [...state.blocks];
		const { process, memoryBlocksRequired } = action.payload || {};
		if (!process || !memoryBlocksRequired) {
			return;
		}

		// Mapeamento dos blocos para manter o rastreamento do uso
		const lruList: number[] = [];

		// Inicializar a lista LRU com os blocos alocados
		blocks.forEach((block, index) => {
			if (block.process) {
				lruList.push(index); // Adiciona os índices dos blocos usados à lista LRU
			}
		});

		let emptyBlocks = blocks
			.map((block, index) => ({ block, index }))
			.filter(({ block }) => !block.process);

		if (emptyBlocks.length < memoryBlocksRequired) {
			// Libera blocos usando LRU até que haja blocos suficientes
			while (emptyBlocks.length < memoryBlocksRequired && lruList.length > 0) {
				const leastRecentlyUsedIndex = lruList.shift(); // Remove o bloco menos recentemente usado
				if (leastRecentlyUsedIndex !== undefined) {
					blocks[leastRecentlyUsedIndex].process = null; // Libera o bloco
					emptyBlocks.push({
						block: blocks[leastRecentlyUsedIndex],
						index: leastRecentlyUsedIndex,
					});
				}
			}

			if (emptyBlocks.length < memoryBlocksRequired) {
				console.error('Memória insuficiente, mesmo após liberar com LRU');
				return;
			}
		}

		// Embaralhar os blocos vazios para garantir alocação não contígua
		emptyBlocks = emptyBlocks.sort(() => Math.random() - 0.5);

		// Alocar blocos não contiguamente para o processo
		let allocatedBlocks: number[] = [];
		for (let i = 0; i < memoryBlocksRequired; i++) {
			const { index: blockIndex } = emptyBlocks[i];
			blocks[blockIndex] = { process, index: blockIndex }; // Aloca o bloco
			allocatedBlocks.push(blockIndex);
		}

		// Atualiza a lista LRU com os blocos recentemente alocados
		allocatedBlocks.forEach((index) => {
			// Move o bloco alocado para o final da lista LRU (mais recentemente usado)
			lruList.push(index);
		});

		// Atualiza o processo com os blocos alocados
		process.allocatedBlocks = allocatedBlocks;

		// Atualiza o estado global com os novos blocos e a lista LRU
		context.patchState({ blocks });

		console.log(`Blocos alocados via LRU: ${allocatedBlocks}`);
	}

	private runNRU(
    context: StateContext<BlocksStateModel>,
    action: BlocksAction.AllocateBlocks
) {
    const state = context.getState();
    const blocks = [...state.blocks];
    const { process, memoryBlocksRequired } = action.payload || {};
    if (!process || !memoryBlocksRequired) {
        console.error('Processo ou quantidade de blocos necessários ausentes.');
        return;
    }

    // Criar lista de blocos vazios
    let emptyBlocks = blocks
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => !block.process);

    if (emptyBlocks.length < memoryBlocksRequired) {
        // Lista de candidatos para liberação (considerados "não referenciados")
        let nruCandidates = blocks
            .map((block, index) => ({ block, index }))
            .filter(({ block }) => block.process !== null && block.process !== undefined)
            .map(({ index }) => index);

        // Liberação de blocos usando NRU
        while (emptyBlocks.length < memoryBlocksRequired && nruCandidates.length > 0) {
            const randomIndex = Math.floor(Math.random() * nruCandidates.length);
            const nruIndex = nruCandidates.splice(randomIndex, 1)[0];
            if (nruIndex !== undefined) {
                blocks[nruIndex].process = null; // Libera o bloco
                emptyBlocks.push({ block: blocks[nruIndex], index: nruIndex }); // Adiciona o bloco liberado aos blocos vazios
            }
        }

        if (emptyBlocks.length < memoryBlocksRequired) {
            console.error('Memória insuficiente após liberar com NRU.');
            return;
        }
    }

    // Embaralhar a lista de blocos vazios para evitar alocação contígua
    emptyBlocks = emptyBlocks.sort(() => Math.random() - 0.5);

    // Alocar blocos aleatoriamente entre os disponíveis
    let allocatedBlocks: number[] = [];
    for (let i = 0; i < memoryBlocksRequired; i++) {
        const { index: blockIndex } = emptyBlocks[i];
        blocks[blockIndex] = { process, index: blockIndex }; // Aloca o bloco para o processo
        allocatedBlocks.push(blockIndex); // Registra o índice do bloco alocado
    }

    // Atualiza os blocos alocados no processo
    process.allocatedBlocks = allocatedBlocks;

    // Atualiza o estado global com os novos blocos alocados
    context.patchState({ blocks });
    console.log(`Blocos alocados via NRU: ${allocatedBlocks}`);
}


	@Action(BlocksAction.ReleaseBlocks)
	releaseBlocks(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.ReleaseBlocks
	) {
		const { blocks } = context.getState();

		const newBlocks = blocks.map((block) => {
			if (
				block.process?.state === 'finished' ||
				block.process?.id === action.payload.id
			) {
				return { process: null, index: block.index }; // Manter o índice do bloco
			} else {
				return block; // Manter o bloco como está
			}
		});

		context.patchState({ blocks: newBlocks });
		this.saveStateToLocalStorage(context.getState());
	}

	@Action(BlocksAction.ReleaseBlockById)
	releaseBlockById(
		context: StateContext<BlocksStateModel>,
		action: BlocksAction.ReleaseBlockById
	) {
		const { blocks } = context.getState();
		const idToRelease = action.id;

		// Atualiza os blocos, liberando aquele que tem o ID correspondente
		const newBlocks = blocks.map((block) => {
			if (block.process?.id === idToRelease) {
				return { process: null, index: block.index }; // Manter o índice do bloco
			}
			return block; // Manter o bloco como está
		});

		context.patchState({ blocks: newBlocks });
		this.saveStateToLocalStorage(context.getState());
	}

	@Action(BlocksAction.ResetState)
	resetState(context: StateContext<BlocksStateModel>) {
		context.patchState({ blocks: BLOCKS_STATE_INITIAL_STATE.blocks });
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
