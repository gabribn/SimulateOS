import { Component, ElementRef, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { Select } from '@ngxs/store';
import { Observable } from 'rxjs';
import { ProcessColors } from 'src/app/shared/constants/process-colors.constants';
import {
  ProcessTypes,
  ProcessTypesNames,
} from 'src/app/shared/constants/process-types.constants';
import { BlocksScalingTypesEnum } from 'src/app/shared/constants/blocks-types.contants';
import { ScalingTypesEnum } from 'src/app/shared/constants/scaling-types.constants';
import { ProcessesState } from 'src/app/shared/stores/processes/processes.state';
import { ColorPickerDialogComponent } from '../color-picker-dialog/color-picker-dialog.component';
import { BlocksState } from '../../stores/blocks/blocks.state';

@Component({
  selector: 'app-create-process-dialog',
  templateUrl: './create-process-dialog.component.html',
  styleUrls: ['./create-process-dialog.component.scss'],
})
export class CreateProcessDialogComponent implements OnInit {
  @Select(ProcessesState.getCurrentScalingType)
  currentScalingType$!: Observable<ScalingTypesEnum>;

  @Select(BlocksState.getBlocksLength)
  blocksLength$!: Observable<number>;

  @Select(BlocksState.getOccupiedBlocksLength)
  occupiedBlocksLength$!: Observable<number>;

  @Select(BlocksState.getFreeBlocksLength)
  freeBlocksLength$!: Observable<number>;

  processForm: FormGroup;
  maxProcesses = 15;
  maxAvailableProcesses = this.maxProcesses;
  maxAvailableBlocks!: number;
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

  blocksPerPage = 5; // Cada página tem 5 blocos
  maxAvailablePages = 12; // Máximo de páginas permitido
  isPagingMode = false; // Flag para verificar se é escalonamento por páginas
  scalingType!: ScalingTypesEnum;
  blockScalingType!: BlocksScalingTypesEnum;

  constructor(
    public dialogRef: MatDialogRef<CreateProcessDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private formBuilder: FormBuilder,
    private dialog: MatDialog,
    private elementRef: ElementRef
  ) {
    this.maxAvailableProcesses = this.maxProcesses - data.availableProcesses;

    // Verifica se o escalonamento é baseado em páginas (FIFO, LRU, NRU)
    this.isPagingMode = data.blockScaling === BlocksScalingTypesEnum.FIFO ||
                        data.blockScaling === BlocksScalingTypesEnum.LRU ||
                        data.blockScaling === BlocksScalingTypesEnum.NRU;

    this.processForm = this.formBuilder.group({
      priority: [0, [Validators.min(0), Validators.max(15)]],
      type: [ProcessTypes.cpuBound],
      color: [ProcessColors.find((color) => color.isAvailable)?.color],
      number: [
        1,
        [Validators.min(1), Validators.max(this.maxAvailableProcesses)],
      ],
      processTimeToFinish: [1, [Validators.required, Validators.min(1)]],
      memoryBlocksRequired: [
        5, // Inicializa com 5 blocos, pois 1 página = 5 blocos
        [Validators.min(1), Validators.max(this.maxAvailableBlocks)],
      ],
      pagesRequired: [
        1, // Inicializa com 1 página
        [Validators.min(1), Validators.max(this.maxAvailablePages)],
      ],
    });

    if (this.isPagingMode) {
      this.processForm.get('pagesRequired')?.valueChanges.subscribe((pages) => {
        this.updateMemoryBlocks(pages); // Atualiza os blocos sempre que as páginas mudarem
      });
    }
  }

  ngOnInit(): void {
    // Definindo o tipo de escalonamento
    this.currentScalingType$.subscribe((value) => (this.scalingType = value));

    // Configurando o máximo de blocos e páginas com base no número de blocos livres
    this.freeBlocksLength$.subscribe((freeBlocks) => {
      this.maxAvailableBlocks = freeBlocks;

      if (this.isPagingMode) {
        this.maxAvailablePages = Math.min(
          Math.floor(freeBlocks / this.blocksPerPage),
          12
        );
        this.processForm.get('pagesRequired')?.setValidators([
          Validators.min(1),
          Validators.max(this.maxAvailablePages),
        ]);
      } else {
        this.processForm.get('memoryBlocksRequired')?.setValidators([
          Validators.min(1),
          Validators.max(this.maxAvailableBlocks),
        ]);
      }
      this.processForm.get('memoryBlocksRequired')?.updateValueAndValidity();
    });
  }

  // Atualiza a quantidade de blocos de acordo com o número de páginas
  updateMemoryBlocks(pages: number): void {
    const totalBlocks = pages * this.blocksPerPage;
    this.processForm.get('memoryBlocksRequired')?.setValue(totalBlocks);
    this.processForm.get('memoryBlocksRequired')?.updateValueAndValidity();
  }

  pickColor() {
    const dialogRef = this.dialog.open(ColorPickerDialogComponent, {
      width: '484px',
    });

    dialogRef.afterClosed().subscribe((res: string) => {
      this.processForm.patchValue({ color: res });
      this.elementRef.nativeElement
        .querySelector('[formcontrolname="color"]')
        .blur();
    });
  }

	get isScalingTypeCircularWithPriorities(): boolean {
    return this.scalingType === ScalingTypesEnum.CircularWithPriorities;
  }

  onClose() {
    this.dialogRef.close();
  }

	onSubmit() {
		if (this.processForm.invalid) {
			this.processForm.markAllAsTouched();
			return;
		}

		const formData = this.processForm.value;

		if (this.isPagingMode) {
			// Distribui os blocos em páginas
			const totalBlocks = formData.pagesRequired * this.blocksPerPage;
			const pages = [];

			for (let i = 0; i < formData.pagesRequired; i++) {
				const startIndex = i * this.blocksPerPage;
				const pageBlocks = []; // Inicializa os blocos da página

				for (let j = startIndex; j < startIndex + this.blocksPerPage; j++) {
					if (j < totalBlocks) {
						pageBlocks.push(j); // Adiciona os blocos da página
					}
				}

				pages.push(pageBlocks); // Adiciona os blocos dessa página ao array de páginas
			}

			formData.pages = pages; // Armazena as páginas no formData
		}

		this.dialogRef.close(formData);
	}

}
