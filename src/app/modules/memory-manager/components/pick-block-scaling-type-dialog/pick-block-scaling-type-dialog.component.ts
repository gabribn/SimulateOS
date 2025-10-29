import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { Select } from '@ngxs/store';
import { Observable, Subscription } from 'rxjs';
import { BlocksState } from 'src/app/shared/stores/blocks/blocks.state';
import { BlocksScalingTypesEnum } from '../../../../shared/constants/blocks-types.contants';
import { GenericSelectData } from 'src/app/shared/models/generic-select-data';

@Component({
	selector: 'app-pick-block-scaling-type-dialog',
	templateUrl: './pick-block-scaling-type-dialog.component.html',
	styleUrls: ['./pick-block-scaling-type-dialog.component.scss'],
})
export class PickBlockScalingTypeDialogComponent implements OnInit, OnDestroy {
	formGroup!: FormGroup;
	subscriptions = new Subscription();
	@Select(BlocksState.getBlockScaling)
	blockScaling$!: Observable<BlocksScalingTypesEnum | null>;
	scalingTypes: GenericSelectData<BlocksScalingTypesEnum>[] = [
		{
			id: BlocksScalingTypesEnum.BestFit,
			description: '',
		},
		{
			id: BlocksScalingTypesEnum.FirstFit,
			description: '',
		},
		{
			id: BlocksScalingTypesEnum.WorstFit,
			description: '',
		},
		{
			id: BlocksScalingTypesEnum.FIFO,
			description: '',
		},
		{
			id: BlocksScalingTypesEnum.LRU,
			description: '',
		},
		{
			id: BlocksScalingTypesEnum.NRU,
			description: '',
		},
	];

	constructor(
		private readonly fb: FormBuilder,
		private readonly dialogRef: MatDialogRef<PickBlockScalingTypeDialogComponent>
	) {
		this.formGroup = this.fb.group({
			scalingType: [null, Validators.required],
		});
	}

	onClose() {
		this.dialogRef.close();
	}

	private getScalingTypeOnState(): void {
		this.subscriptions.add(
			this.blockScaling$.subscribe((value) => {
				if (!value) return;

				const scalingType = this.scalingTypes.find(({ id }) => id === value);

				if (scalingType) this.formGroup.patchValue({ scalingType });
			})
		);
	}

	onSubmit(event: SubmitEvent): void {
		event.preventDefault();

		if (this.formGroup.invalid) return;

		const { scalingType } = this.formGroup.value;

		this.dialogRef.close(scalingType.id);
	}

	ngOnInit(): void {
		this.getScalingTypeOnState();
	}

	ngOnDestroy(): void {
		this.subscriptions.unsubscribe();
	}
}
