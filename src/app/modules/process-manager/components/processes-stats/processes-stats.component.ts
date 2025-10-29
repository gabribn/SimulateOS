import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSliderChange } from '@angular/material/slider';
import { Select, Store } from '@ngxs/store';
import { Observable, Subscription } from 'rxjs';

import { ScalingTypesEnum } from 'src/app/shared/constants/scaling-types.constants';
import { Process } from 'src/app/shared/models/process';
import { Processes } from 'src/app/shared/stores/processes/processes.actions';
import { ProcessesState } from 'src/app/shared/stores/processes/processes.state';
import { PickScalingTypeDialogComponent } from '../pick-scaling-type-dialog/pick-scaling-type-dialog.component';

@Component({
	selector: 'app-processes-stats',
	templateUrl: './processes-stats.component.html',
	styleUrls: ['./processes-stats.component.scss'],
})
export class ProcessesStatsComponent implements OnInit, OnDestroy {
	private subscriptions: Subscription = new Subscription();
	@Select(ProcessesState.getAvailableProcesses)
	availableProcesses$!: Observable<Process[]>;
	@Select(ProcessesState.getTimer) timer$!: Observable<number>;
	@Select(ProcessesState.getIOWaitTime) ioWaitTime$!: Observable<number>;
	@Select(ProcessesState.getTimeSlice) timeSlice$!: Observable<number>;
	@Select(ProcessesState.getCurrentScalingType)
	scalingType$!: Observable<ScalingTypesEnum>;
	formGroup!: FormGroup;

	constructor(
		private readonly formBuilder: FormBuilder,
		private readonly store: Store,
		private readonly dialog: MatDialog
	) {
		this.formGroup = this.formBuilder.group({
			ioWaitTime: [null],
			timeSlice: [null],
		});
	}

	private initFormsObservable(): void {
		this.subscriptions.add(
			this.formGroup.get('ioWaitTime')?.valueChanges.subscribe((value) => {
				this.store.dispatch(new Processes.SetIOWaitTime(value));
			})
		);

		this.subscriptions.add(
			this.formGroup.get('timeSlice')?.valueChanges.subscribe((value) => {
				this.store.dispatch(new Processes.SetTimeSlice(value));
			})
		);
	}

	// startTimer() {
	// 	setInterval(() => {
	// 		this.store.dispatch(new Processes.IncrementTimer());
	// 	}, 1000);
	// }

	stopProcesses() {
		this.store.dispatch(new Processes.StopProcesses());
	}

	changeIOWaitTime(event: MatSliderChange) {
		this.store.dispatch(new Processes.SetIOWaitTime(event.value!));
	}

	changeTimeSlice(event: MatSliderChange) {
		this.store.dispatch(new Processes.SetTimeSlice(event.value!));
	}

	handleOpenSelectScalingType() {
		const dialogRef = this.dialog.open(PickScalingTypeDialogComponent, {
			width: '600px',
			disableClose: true,
		});

		dialogRef.afterClosed().subscribe((res?: ScalingTypesEnum) => {
			if (res) {
				this.store.dispatch(new Processes.PickScalingType(res));
			}
		});
	}

	handleQuantity(
		type: 'increment' | 'decrement',
		formControlName: string
	): void {
		const limiters = {
			ioWaitTime: {
				min: 1,
				max: 10,
			},
			timeSlice: {
				min: 2,
				max: 10,
			},
			cpuClock: {
				min: 1,
				max: 10,
			},
		};

		const formControl = this.formGroup.get(formControlName);

		if (formControl) {
			const currentValue = formControl.value;

			const key = formControlName as keyof typeof limiters;

			if (type === 'increment') {
				if (currentValue < limiters[key].max) {
					formControl.setValue(currentValue + 1);
				}
			} else {
				if (currentValue > limiters[key].min) {
					formControl.setValue(currentValue - 1);
				}
			}
		}
	}

	ngOnInit() {
		// this.startTimer();

		this.subscriptions.add(
			this.ioWaitTime$.subscribe((ioWaitTime) =>
				this.formGroup
					.get('ioWaitTime')
					?.setValue(ioWaitTime, { emitEvent: false })
			)
		);

		this.subscriptions.add(
			this.timeSlice$.subscribe((timeSlice) =>
				this.formGroup
					.get('timeSlice')
					?.setValue(timeSlice, { emitEvent: false })
			)
		);

		this.initFormsObservable();
	}

	ngOnDestroy() {
		this.subscriptions.unsubscribe();
	}
}
