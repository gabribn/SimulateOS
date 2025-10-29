// process-manager.component.ts

import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuTrigger } from '@angular/material/menu';
import { Select, Store } from '@ngxs/store';
import { Observable, Subscription } from 'rxjs';

import {
  ProcessStates,
  ProcessStatesColors,
  ProcessStatesNames,
  ProcessStatesType,
} from 'src/app/shared/constants/process-states.constants';
import {
  ProcessTypesNames,
  ProcessTypesType,
} from 'src/app/shared/constants/process-types.constants';
import { ScalingTypesEnum } from 'src/app/shared/constants/scaling-types.constants';
import { CreateProcessDTO, Process } from 'src/app/shared/models/process';
import { Processes } from 'src/app/shared/stores/processes/processes.actions';
import { ProcessesState } from 'src/app/shared/stores/processes/processes.state';
import { EditProcessDialogComponent } from '../../shared/components/edit-process-dialog/edit-process-dialog.component';
import { ProcessLifetimeDialogComponent } from './components/process-lifetime-dialog/process-lifetime-dialog.component';
import { UpdatePriorityDialogComponent } from './components/update-priority-dialog/update-priority-dialog.component';
import { Box } from '../../shared/models/box';
import { BlocksState } from 'src/app/shared/stores/blocks/blocks.state';
import { CreateProcessDialogComponent } from 'src/app/shared/components/create-process-dialog/create-process-dialog.component';

interface Sequence {
  start: number;
  length: number;
}

@Component({
  selector: 'app-process-manager',
  templateUrl: './process-manager.component.html',
  styleUrls: ['./process-manager.component.scss'],
})
export class ProcessManagerComponent implements OnInit, OnDestroy {
  @Select(ProcessesState.getAvailableProcesses) availableProcesses$!: Observable<Process[]>;
  @Select(ProcessesState.getExecutingProcess) executingProcess$!: Observable<Process>;
  @Select(ProcessesState.getIOProcess) ioProcess$!: Observable<Process>;
  @Select(ProcessesState.getReadyProcesses) readyProcesses$!: Observable<Process[]>;
  @Select(ProcessesState.getSuspendedAndFinishedProcesses) suspendedFinishedProcesses$!: Observable<Process[]>;
  @Select(ProcessesState.getIOQueueProcesses) iOProcesses$!: Observable<Process[]>;
  @Select(ProcessesState.getDisplayedColumns) displayedColumns$!: Observable<Array<string>>;
  @Select(ProcessesState.getFinishedProcesses) finishedProcesses$!: Observable<Array<string>>;
  @Select(ProcessesState.getFinishedCPUBoundProcesses) getFinishedCPUBoundProcesses$!: Observable<Array<Process>>;
  @Select(ProcessesState.getNotFinishedProcesses) notFinishedProcesses$!: Observable<Process[]>;
	@Select(BlocksState.getBlocks) blocks$!: Observable<Box[]>;

  @ViewChild(MatMenuTrigger) actionsMenu!: MatMenuTrigger;

  readonly processState = ProcessesState;
  readonly scalingTypeEnum = ScalingTypesEnum;

  private subscriptions: Subscription = new Subscription();
  availableProcesses: Process[] = [];
  executingProcesses: Process[] = [];
  ioProcess?: Process;
  maxProcesses = 15;
  ioColumns: Array<string> = [];
  sequences: Sequence[] = [];
  boxWidth: number = 0;
  totalCols: number = 5;
  totalRows: number = 11.2;
  minTotalBlocks: number = 120;
  selectedIndex: number = 0;
  generatedBlocksInfo: string = "";
  longestEmptySequenceLength: number = 0;
  selectedProcessSize: number = 1;
  lastAllocatedBlockIndex: number = -1;
  lastColorIndex: number = -1;
	rows = Array.from({ length: 24 }).fill(0).map((_, i) => i);

  readonly BLOCK_WIDTH: number = 50;
  readonly BLOCK_HEIGHT: number = 50;

  constructor(private dialog: MatDialog, private store: Store) {}

  ngOnInit() {
    this.subscriptions.add(
      this.notFinishedProcesses$.subscribe((processes: Process[]) => {
        this.availableProcesses = processes;
      })
    );

    this.subscriptions.add(
      this.ioProcess$.subscribe(
        (process) => (this.ioProcess = process ? { ...process } : undefined)
      )
    );

    this.subscriptions.add(
      this.displayedColumns$.subscribe((columns) => {
        const ioColumns = columns.filter((column) => column !== 'priority');
        this.ioColumns = [...ioColumns];
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  getTypeName(type: ProcessTypesType): string {
    return ProcessTypesNames[type];
  }

  getStateName(state: ProcessStatesType): string {
    return ProcessStatesNames[state];
  }

  getStateColor(state: ProcessStatesType): string {
    return ProcessStatesColors[state];
  }

  createProcess() {
    const availableProcesses = this.availableProcesses?.length;

    const dialogRef = this.dialog.open(CreateProcessDialogComponent, {
      width: '600px',
      disableClose: true,
      data: {
        availableProcesses,
      },
    });

    dialogRef.afterClosed().subscribe((res?: CreateProcessDTO) => {
      if (res) {
        this.store.dispatch(new Processes.CreateProcess(res)).subscribe(() => {
        });
      }
    });
  }

  getRowStartIndex(rowIndex: number): number {
    return rowIndex * this.totalCols;
  }

	editProcess(process: Process) {
		if (process.state === ProcessStates.finished) return;

		console.log('Process data before opening dialog:', process);  // Log para verificar os dados do processo

		const dialogRef = this.dialog.open(EditProcessDialogComponent, {
			width: '600px',
			disableClose: true,
			data: { process },
		});

		dialogRef.afterClosed().subscribe((res?: CreateProcessDTO) => {
			if (res) {
				this.store.dispatch(new Processes.EditProcess(process, res));
			}
		});
	}


  openActionsMenu(process: Process) {
    this.actionsMenu.menuData = { process };
    this.actionsMenu.openMenu();
  }

		isProcessSuspended(process: Process) {
			return process.state === ProcessStates.suspended;
		}

  canCreateProcess() {
    if (this.maxProcesses - this.availableProcesses.length > 0) return true;

    return false;
  }

  handleOpenProcessLifetimeDialog(): void {
    this.dialog.open(ProcessLifetimeDialogComponent, {
      width: '80%',
    });
  }
}
