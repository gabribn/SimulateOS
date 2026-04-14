import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ScalingTypesEnum } from 'src/app/shared/constants/scaling-types.constants';
import { BlocksScalingTypesEnum } from 'src/app/shared/constants/blocks-types.contants';
import { ProcessColors } from 'src/app/shared/constants/process-colors.constants';
import { ProcessTypes, ProcessTypesNames } from 'src/app/shared/constants/process-types.constants';
import {
	PageAllocationHistoryEntry,
	Process,
} from 'src/app/shared/models/process';
import { BlocksAction } from 'src/app/shared/stores/blocks/blocks.action';
import { BlocksState } from 'src/app/shared/stores/blocks/blocks.state';
import { ProcessesState } from 'src/app/shared/stores/processes/processes.state';
import { Store } from '@ngxs/store';

export interface EditProcessDialogData {
	process: Process;
	blockScaling?: BlocksScalingTypesEnum;
	focusPageNumber?: number;
	useSwap?: boolean;
}

/** Um passo no histórico da página (sem fundir colocações consecutivas). */
export type PageHistorySegmentView =
	| { kind: 'notice'; message: string }
	| {
			kind: 'placement';
			location: 'physical' | 'swap';
			blockIndices: number[];
	  };

export interface PageHistoryPageView {
	pageNumber: number;
	segments: PageHistorySegmentView[];
}

@Component({
  selector: 'app-edit-process-dialog',
  templateUrl: './edit-process-dialog.component.html',
  styleUrls: ['./edit-process-dialog.component.scss'],
})
export class EditProcessDialogComponent implements OnInit {
  processForm: FormGroup;
  isPagingMode = false; // Flag para determinar se o tipo de escalonamento é de paginação
  isEditable = false; // Flag para determinar se o processo é editável

  // Mantendo os typeOptions com base no ScalingTypesEnum
  typeOptions = [
    {
      label: ProcessTypesNames.cpuBound,
      value: ProcessTypes.cpuBound,
    },
    {
      label: ProcessTypesNames.ioBound,
      value: ProcessTypes.ioBound,
    },
    {
      label: ProcessTypesNames.cpuAndIoBound,
      value: ProcessTypes.cpuAndIoBound,
    },
  ];

  constructor(
    public dialogRef: MatDialogRef<EditProcessDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EditProcessDialogData,
    private readonly formBuilder: FormBuilder,
    private store: Store
  ) {
    this.processForm = this.formBuilder.group({
      priority: [
        data.process.priority,
        [Validators.min(0), Validators.max(15)],
      ],
      state: [data.process.state],
      type: [data.process.type],
      color: [data.process.color],
      isAvailable: [data.process.isAvailable ?? true],
    });
  }

  ngOnInit(): void {
    const blockScaling =
      this.data.blockScaling ??
      this.store.selectSnapshot(BlocksState.getBlockScaling);

    // Verifica se o escalonamento atual é baseado em páginas (FIFO, LRU, NRU)
    this.isPagingMode =
      blockScaling === BlocksScalingTypesEnum.FIFO ||
      blockScaling === BlocksScalingTypesEnum.LRU ||
      blockScaling === BlocksScalingTypesEnum.NRU;

    // Edição de prioridade só no escalonamento de CPU com prioridades (não confundir com memória)
    this.isEditable =
      this.store.selectSnapshot(ProcessesState.getCurrentScalingType) ===
      ScalingTypesEnum.CircularWithPriorities;
  }

  get pageAllocationHistoryOrdered(): PageAllocationHistoryEntry[] {
    const h = this.data.process.pageAllocationHistory;
    if (!h?.length) {
      return [];
    }
    return [...h].sort((a, b) => a.sequence - b.sequence);
  }

  private get memoryUsesSwap(): boolean {
    return (
      this.data.useSwap ?? this.store.selectSnapshot(BlocksState.getUseSwap)
    );
  }

  get pagesWithConsolidatedHistory(): PageHistoryPageView[] {
    return this.memoryUsesSwap
      ? this.buildHistoryMergedByLocation()
      : this.buildHistoryPerEvent();
  }

  private buildHistoryMergedByLocation(): PageHistoryPageView[] {
    const ordered = this.pageAllocationHistoryOrdered;
    if (!ordered.length) {
      return [];
    }

    const byPage = new Map<number, PageAllocationHistoryEntry[]>();
    for (const ev of ordered) {
      const list = byPage.get(ev.pageNumber) ?? [];
      list.push(ev);
      byPage.set(ev.pageNumber, list);
    }

    const pageNumbers = [...byPage.keys()].sort((a, b) => a - b);

    return pageNumbers.map((pageNumber) => {
      const events = byPage.get(pageNumber)!;
      const segments: PageHistorySegmentView[] = [];

      for (const ev of events) {
        if (ev.location !== 'physical' && ev.location !== 'swap') {
          continue;
        }
        const parts = ev.blockIndices?.length ? [...ev.blockIndices] : [];
        const last = segments[segments.length - 1];

        if (
          last &&
          last.kind === 'placement' &&
          last.location === ev.location
        ) {
          last.blockIndices.push(...parts);
        } else {
          segments.push({
            kind: 'placement' as const,
            location: ev.location,
            blockIndices: [...parts],
          });
        }
      }

      return { pageNumber, segments };
    });
  }

  private buildHistoryPerEvent(): PageHistoryPageView[] {
    const ordered = this.pageAllocationHistoryOrdered;
    if (!ordered.length) {
      return [];
    }

    const byPage = new Map<number, PageAllocationHistoryEntry[]>();
    for (const ev of ordered) {
      const list = byPage.get(ev.pageNumber) ?? [];
      list.push(ev);
      byPage.set(ev.pageNumber, list);
    }

    const pageNumbers = [...byPage.keys()].sort((a, b) => a - b);

    return pageNumbers.map((pageNumber) => {
      const events = byPage.get(pageNumber)!;
      const segments: PageHistorySegmentView[] = events.map((ev) => {
        if (ev.detailMessage && !ev.location) {
          return { kind: 'notice' as const, message: ev.detailMessage };
        }
        return {
          kind: 'placement' as const,
          location: ev.location ?? 'physical',
          blockIndices: [...(ev.blockIndices ?? [])],
        };
      });

      return { pageNumber, segments };
    });
  }

  formatSegmentChain(indices: number[]): string {
    if (indices?.length) {
      return indices.join(' -> ');
    }
    return '—';
  }

  get allocatedBlocks(): number[] {
    return this.data.process.allocatedBlocks || [];
  }

  // Mantendo a lógica para processTypeDescription
  get processTypeDescription(): string {
    const processType = this.data.process.type;
    const typeOption = this.typeOptions.find((option) => option.value === processType);
    return typeOption ? typeOption.label : 'Desconhecido';
  }

  onSubmit() {
    this.dialogRef.close(this.processForm.value);
  }

  onClose() {
    this.dialogRef.close();
  }

  suspendProcess() {
    this.processForm.patchValue({ state: 'suspended' });
    this.data.process.state = 'suspended';
    localStorage.setItem(`process-${this.data.process.id}`, JSON.stringify(this.processForm.value));
  }

  finishProcess() {
    ProcessColors.find((item) => item.color === this.data.process!.color)!.isAvailable = true;
    this.processForm.patchValue({ state: 'finished' });
    this.store.dispatch(new BlocksAction.ReleaseBlockById(this.data.process!.id));
  }

  resumeProcess() {
    this.processForm.patchValue({ state: 'ready' });
    this.data.process.state = 'ready';
    localStorage.setItem(`process-${this.data.process.id}`, JSON.stringify(this.processForm.value));
  }
}
