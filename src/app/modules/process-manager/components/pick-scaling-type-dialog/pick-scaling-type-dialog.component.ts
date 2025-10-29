import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { Select } from '@ngxs/store';
import { Observable, Subscription } from 'rxjs';

import { ScalingTypesEnum } from 'src/app/shared/constants/scaling-types.constants';
import { GenericSelectData } from 'src/app/shared/models/generic-select-data';
import { ProcessesService } from 'src/app/shared/services/processes.service';
import { ProcessesState } from 'src/app/shared/stores/processes/processes.state';

@Component({
	selector: 'app-pick-scaling-type-dialog',
	templateUrl: './pick-scaling-type-dialog.component.html',
	styleUrls: ['./pick-scaling-type-dialog.component.scss'],
})
export class PickScalingTypeDialogComponent implements OnInit, OnDestroy {
	@Select(ProcessesState.getCurrentScalingType)
	currentScalingType$!: Observable<ScalingTypesEnum | null>;
	formGroup!: FormGroup;
	subscriptions = new Subscription();
	scalingTypes: GenericSelectData<ScalingTypesEnum>[] = [];

	constructor(
		private readonly fb: FormBuilder,
		private readonly dialogRef: MatDialogRef<PickScalingTypeDialogComponent>,
		private readonly processesService: ProcessesService
	) {
		this.formGroup = this.fb.group({
			scalingType: [null, Validators.required],
		});

		this.scalingTypes = this.processesService.getScalingTypesSelectData();
	}

	private getScalingTypeOnState(): void {
		this.subscriptions.add(
			this.currentScalingType$.subscribe((value) => {
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

	onClose() {
		this.dialogRef.close();
	}

	ngOnInit(): void {
		this.getScalingTypeOnState();
	}

	ngOnDestroy(): void {
		this.subscriptions.unsubscribe();
	}
}
