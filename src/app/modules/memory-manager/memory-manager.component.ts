import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Select, Store } from '@ngxs/store';
import { Observable, Subject } from 'rxjs';
import { takeUntil, map } from 'rxjs/operators';
import { BlocksScalingTypesEnum } from 'src/app/shared/constants/blocks-types.contants';
import { Box } from 'src/app/shared/models/box';
import { BlocksState } from 'src/app/shared/stores/blocks/blocks.state';
import { PickBlockScalingTypeDialogComponent } from './components/pick-block-scaling-type-dialog/pick-block-scaling-type-dialog.component';
import { BlocksAction } from 'src/app/shared/stores/blocks/blocks.action';
import { CreateProcessDialogComponent } from 'src/app/shared/components/create-process-dialog/create-process-dialog.component';
import { Processes } from 'src/app/shared/stores/processes/processes.actions';
import { CreateProcessDTO, Process } from 'src/app/shared/models/process';
import { ProcessesState } from 'src/app/shared/stores/processes/processes.state';
import { EditProcessDialogComponent } from '../../shared/components/edit-process-dialog/edit-process-dialog.component';
import { Sequence } from 'src/app/shared/models/sequence';

@Component({
	selector: 'app-memory-manager',
	templateUrl: './memory-manager.component.html',
	styleUrls: ['./memory-manager.component.scss'],
})
export class MemoryManagerComponent implements OnInit, OnDestroy {
	@Select(BlocksState.getSequences) sequences$!: Observable<Sequence[]>;
	@Select(BlocksState.getBlocks) blocks$!: Observable<Box[]>;
	@Select(BlocksState.getSwapBlocks) swapBlocks$!: Observable<Box[]>; 
	@Select(ProcessesState.getTimer) timer$!: Observable<number>;
	@Select(BlocksState.getBlockScaling)
	blockScaling$!: Observable<BlocksScalingTypesEnum>;
	@Select(ProcessesState.getAvailableProcesses)
	availableProcesses$!: Observable<Process[]>;
	@Select(ProcessesState.getSuspendedProcesses)
	suspendedProcesses$!: Observable<Process[]>;
	availableProcesses: Process[] = [];
	@Select(ProcessesState.getNotFinishedProcesses) notFinishedProcesses$!: Observable<Process[]>;
	notFinishedProcesses: Process[] = [];
	@Select(ProcessesState.getFinishedProcesses) finishedProcesses$!: Observable<
		Process[]
	>;
	private _notifier$ = new Subject<void>();
	private lastNruClearTime = 0;

	timerInSeconds$!: Observable<number>;

	constructor(
		private readonly dialog: MatDialog,
		private readonly store: Store
	) {
		this.timerInSeconds$ = this.timer$.pipe(
            map(milliseconds => milliseconds / 1000)
        );
	}

	ngOnInit(): void {
		this.availableProcesses$
			.pipe(takeUntil(this._notifier$))
			.subscribe((processes) => (this.availableProcesses = [...processes]));

		this.notFinishedProcesses$
			.pipe(takeUntil(this._notifier$))
			.subscribe((processes: Process[]) => {
        		// Filtra processos que ainda não estão "finished", mantendo a ordem original
				const updatedProcesses = processes.filter(process => process.state !== 'finished');
				
        		// Atualiza a lista somente se houve alteração
				if (this.notFinishedProcesses.length !== updatedProcesses.length) {
					this.notFinishedProcesses = updatedProcesses;
				}
			});

        this.timerInSeconds$
            .pipe(takeUntil(this._notifier$))
            .subscribe((seconds: number) => {
                
                const CLOCK_INTERRUPT_INTERVAL = 15; 

                if (seconds < this.lastNruClearTime) {
                    this.lastNruClearTime = 0;
                }

                if (seconds - this.lastNruClearTime >= CLOCK_INTERRUPT_INTERVAL) {
                    
                    this.lastNruClearTime = seconds;

                    const currentAlgorithm = this.store.selectSnapshot(BlocksState.getBlockScaling);

                    if (currentAlgorithm === BlocksScalingTypesEnum.NRU) {
                        this.store.dispatch(new BlocksAction.ClearReferenceBits());
                        console.log(`[Clock Interrupt] Relógio bateu ${seconds.toFixed(2)}s. Bits do NRU zerados.`);
                    }
                }
            });
	}

	openBlockScalingTypeDialog(): void {
		const ref = this.dialog.open(PickBlockScalingTypeDialogComponent);

		ref
			.afterClosed()
			.pipe(takeUntil(this._notifier$))
			.subscribe((result?: BlocksScalingTypesEnum) => {
				if (!result) return;

				this.store.dispatch(new BlocksAction.PickBlockScalingType(result));
			});
	}

	createProcess() {
		const availableProcesses = this.availableProcesses.length;

		// Obtém o tipo de escalonamento atual
		const blockScaling = this.store.selectSnapshot(BlocksState.getBlockScaling);

		// Defina os labels e o limite máximo de páginas dinamicamente com base no escalonamento
		const isPaging =
			blockScaling === BlocksScalingTypesEnum.FIFO ||
			blockScaling === BlocksScalingTypesEnum.LRU ||
			blockScaling === BlocksScalingTypesEnum.NRU;

		const labels = {
			memoryLabel: isPaging
				? 'Quantidade de páginas'
				: 'Quantidade de blocos de memória',
			maxLabel: isPaging
				? 'Máximo de páginas permitido'
				: 'Máximo de blocos permitido',
			maxAvailablePages: isPaging ? 24 : 120, // Definir máximo de páginas se for escalonamento baseado em páginas
		};

		const dialogRef = this.dialog.open(CreateProcessDialogComponent, {
			width: '600px',
			disableClose: true,
			data: {
				availableProcesses,
				blockScaling, // Passa o escalonamento atual
				labels, // Passa os labels dinâmicos e máximo de páginas
			},
		});

		dialogRef.afterClosed().subscribe((res?: CreateProcessDTO) => {
			if (res) {
				this.store.dispatch(new Processes.CreateProcess(res));
			}
		});
	}

	editProcess(process: Process) {
		// Obtém o tipo de escalonamento atual
		const blockScaling = this.store.selectSnapshot(BlocksState.getBlockScaling);

		const dialogRef = this.dialog.open(EditProcessDialogComponent, {
			width: '600px',
			disableClose: true,
			data: {
				process,
				blockScaling, // Passa o tipo de escalonamento atual para o diálogo
			},
		});

		dialogRef.afterClosed().subscribe((res?: CreateProcessDTO) => {
			if (res) {
				this.store.dispatch(new Processes.EditProcess(process, res));
			}
		});
	}

	blocksPerPage = 5;

	getPageNumbers(process: Process): number[] {
		const allocatedBlocks = process.allocatedBlocks || [];
		const totalPages = Math.ceil(allocatedBlocks.length / this.blocksPerPage);
		return Array.from({ length: totalPages }, (_, index) => index + 1);
	}



	isContiguousScalingType(type: BlocksScalingTypesEnum | null): boolean {
		return (
			type === BlocksScalingTypesEnum.FirstFit ||
			type === BlocksScalingTypesEnum.BestFit ||
			type === BlocksScalingTypesEnum.WorstFit
		);
	}

	stopProcesses() {
		this.store.dispatch(new Processes.StopProcesses());
	}

	ngOnDestroy(): void {
		this._notifier$.next();
		this._notifier$.complete();
	}
}
