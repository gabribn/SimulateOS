import {
  Component,
  ElementRef,
  Inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { Select, Store } from '@ngxs/store';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ProcessColors } from 'src/app/shared/constants/process-colors.constants';
import {
  ProcessTypes,
  ProcessTypesNames,
} from 'src/app/shared/constants/process-types.constants';
import { BlocksScalingTypesEnum } from 'src/app/shared/constants/blocks-types.contants';
import { ScalingTypesEnum } from 'src/app/shared/constants/scaling-types.constants';
import { getMemoryHardwareProfile } from 'src/app/shared/constants/memory-simulation.constants';
import { ProcessesState } from 'src/app/shared/stores/processes/processes.state';
import { ColorPickerDialogComponent } from '../color-picker-dialog/color-picker-dialog.component';
import { BlocksState } from '../../stores/blocks/blocks.state';
import { BlocksAction } from '../../stores/blocks/blocks.action';

@Component({
  selector: 'app-create-process-dialog',
  templateUrl: './create-process-dialog.component.html',
  styleUrls: ['./create-process-dialog.component.scss'],
})
export class CreateProcessDialogComponent implements OnInit, OnDestroy {
  @Select(ProcessesState.getCurrentScalingType)
  currentScalingType$!: Observable<ScalingTypesEnum>;

  @Select(BlocksState.getBlocksLength)
  blocksLength$!: Observable<number>;

  @Select(BlocksState.getOccupiedBlocksLength)
  occupiedBlocksLength$!: Observable<number>;

  @Select(BlocksState.getFreeBlocksLength)
  freeBlocksLength$!: Observable<number>;

  @Select(BlocksState.getUseSwap)
  useSwap$!: Observable<boolean>;

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

  blocksPerPage = 5;
  maxPagesPerProcessCap!: number;
  maxAvailablePages = 1;
  isPagingMode = false;
  scalingType!: ScalingTypesEnum;
  blockScalingType!: BlocksScalingTypesEnum;

  useSwapEnabled = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    public dialogRef: MatDialogRef<CreateProcessDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private formBuilder: FormBuilder,
    private dialog: MatDialog,
    private elementRef: ElementRef,
    private store: Store
  ) {
    this.maxAvailableProcesses = this.maxProcesses - data.availableProcesses;

    this.isPagingMode =
      data.blockScaling === BlocksScalingTypesEnum.FIFO ||
      data.blockScaling === BlocksScalingTypesEnum.LRU ||
      data.blockScaling === BlocksScalingTypesEnum.NRU;

    const useSwap = this.store.selectSnapshot(BlocksState.getUseSwap);
    this.maxPagesPerProcessCap =
      getMemoryHardwareProfile(useSwap).maxPagesPerProcessCap;
    this.maxAvailablePages = this.maxPagesPerProcessCap;

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
        5,
        [Validators.min(1), Validators.max(this.maxAvailableBlocks)],
      ],
      pagesRequired: [
        1,
        [Validators.min(1), Validators.max(this.maxAvailablePages)],
      ],
    });

    if (this.isPagingMode) {
      this.processForm.get('pagesRequired')?.valueChanges.subscribe((pages) => {
        this.updateMemoryBlocks(pages);
      });
    }
  }

  ngOnInit(): void {
    this.useSwapEnabled = this.store.selectSnapshot(BlocksState.getUseSwap);

    this.useSwap$
      .pipe(takeUntil(this.destroy$))
      .subscribe((v) => (this.useSwapEnabled = v));

    this.currentScalingType$
      .pipe(takeUntil(this.destroy$))
      .subscribe((value) => (this.scalingType = value));

    this.freeBlocksLength$
      .pipe(takeUntil(this.destroy$))
      .subscribe((freeBlocks) => this.applyMemoryLimitValidators(freeBlocks));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onUseSwapChange(enabled: boolean): void {
    if (this.store.selectSnapshot(BlocksState.getUseSwap) === enabled) {
      return;
    }
    this.store.dispatch(new BlocksAction.SetUseSwap(enabled));
  }

  private applyMemoryLimitValidators(freeBlocks: number): void {
    const useSwap = this.store.selectSnapshot(BlocksState.getUseSwap);
    this.maxPagesPerProcessCap =
      getMemoryHardwareProfile(useSwap).maxPagesPerProcessCap;
    this.maxAvailableBlocks = freeBlocks;

    if (this.isPagingMode) {
      this.maxAvailablePages = Math.min(
        Math.floor(freeBlocks / this.blocksPerPage),
        this.maxPagesPerProcessCap
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
  }

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
      const totalBlocks = formData.pagesRequired * this.blocksPerPage;
      const pages = [];

      for (let i = 0; i < formData.pagesRequired; i++) {
        const startIndex = i * this.blocksPerPage;
        const pageBlocks = [];

        for (let j = startIndex; j < startIndex + this.blocksPerPage; j++) {
          if (j < totalBlocks) {
            pageBlocks.push(j);
          }
        }

        pages.push(pageBlocks);
      }

      formData.pages = pages;
    }

    this.dialogRef.close(formData);
  }
}
