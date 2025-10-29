import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ScalingTypesEnum } from 'src/app/shared/constants/scaling-types.constants';
import { BlocksScalingTypesEnum } from 'src/app/shared/constants/blocks-types.contants';
import { ProcessColors } from 'src/app/shared/constants/process-colors.constants';
import { ProcessTypes, ProcessTypesNames } from 'src/app/shared/constants/process-types.constants';
import { Process } from 'src/app/shared/models/process';
import { BlocksAction } from 'src/app/shared/stores/blocks/blocks.action';
import { Store } from '@ngxs/store';

@Component({
  selector: 'app-edit-process-dialog',
  templateUrl: './edit-process-dialog.component.html',
  styleUrls: ['./edit-process-dialog.component.scss'],
})
export class EditProcessDialogComponent implements OnInit {
  processForm: FormGroup;
  blocksPerPage = 5; // Cada página contém 5 blocos
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
    @Inject(MAT_DIALOG_DATA) public data: any, // Recebendo process e blockScaling
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
      isAvailable: [data.process.isAvailable],
    });
  }

  ngOnInit(): void {
    // Verifica se o escalonamento atual é baseado em páginas (FIFO, LRU, NRU)
    this.isPagingMode =
      this.data.blockScaling === BlocksScalingTypesEnum.FIFO ||
      this.data.blockScaling === BlocksScalingTypesEnum.LRU ||
      this.data.blockScaling === BlocksScalingTypesEnum.NRU;

    // Mantendo o uso de ScalingTypesEnum para definir se o processo é editável
    this.isEditable = this.data.blockScaling === ScalingTypesEnum.CircularWithPriorities;
  }

  // Organiza os blocos em páginas se for escalonamento baseado em páginas
  get pagesWithBlocks(): { pageNumber: number; blocks: number[] }[] {
    if (!this.isPagingMode) {
      return [];
    }

    const allocatedBlocks = this.data.process.allocatedBlocks || [];
    const pages = [];

    for (let i = 0; i < allocatedBlocks.length; i += this.blocksPerPage) {
      const pageBlocks = allocatedBlocks.slice(i, i + this.blocksPerPage);
      pages.push({
        pageNumber: pages.length + 1,
        blocks: pageBlocks,
      });
    }

    return pages;
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
