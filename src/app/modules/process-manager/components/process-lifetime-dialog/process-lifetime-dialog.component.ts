import { DOCUMENT } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { MatDialogRef } from '@angular/material/dialog';
import { Select, Store } from '@ngxs/store';
import {
	ApexAxisChartSeries,
	ApexChart,
	ApexDataLabels,
	ApexPlotOptions,
	ChartComponent,
} from 'ng-apexcharts';
import { Observable, Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

import {
	ProcessTypesNames,
	ProcessTypesType,
} from 'src/app/shared/constants/process-types.constants';
import { Log } from 'src/app/shared/models/log';
import { Process } from 'src/app/shared/models/process';
import { LogsState } from 'src/app/shared/stores/logs/logs.state';
import { ProcessesState } from 'src/app/shared/stores/processes/processes.state';

interface CustomProcess extends Process {
	checked: boolean;
}

interface ChartOptions {
	series: ApexAxisChartSeries;
	chart: ApexChart;
	dataLabels: ApexDataLabels;
	plotOptions: ApexPlotOptions;
}

@Component({
	selector: 'app-process-lifetime-dialog',
	templateUrl: './process-lifetime-dialog.component.html',
	styleUrls: ['./process-lifetime-dialog.component.scss'],
})
export class ProcessLifetimeDialogComponent implements OnInit, OnDestroy {
	@ViewChild('chart') chart!: ChartComponent;
	subscription = new Subscription();
	@Select(ProcessesState.getFinishedCPUBoundProcesses)
	getFinishedCPUBoundProcesses$!: Observable<Array<Process>>;
	@Select(ProcessesState.getDisplayedColumns)
	getDisplayedColumns$!: Observable<string>;
	finishedProcesses: Array<CustomProcess> = [];
	displayedColumns: Array<string> = [];
	chartOptions: ChartOptions | null = null;
	isFullscreen = false;

	constructor(
		@Inject(DOCUMENT) private readonly document: Document,
		private readonly dialogRef: MatDialogRef<ProcessLifetimeDialogComponent>,
		private readonly store: Store
	) {}

	get isAllProcessesChecked(): boolean {
		return this.finishedProcesses.every(({ checked }) => checked);
	}

	get checkedProcessesLength(): number {
		return this.finishedProcesses.filter(({ checked }) => checked).length;
	}

	private logTime(log: Log): number | null {
		const t = log?.currentTime as unknown;
		if (typeof t === 'number' && Number.isFinite(t)) {
			return t;
		}
		if (typeof t === 'string') {
			const n = Number(t);
			return Number.isFinite(n) ? n : null;
		}
		return null;
	}

	private getFinishedProcesses(): void {
		this.subscription.add(
			this.getDisplayedColumns$.subscribe(
				(value) => (this.displayedColumns = ['check', ...value])
			)
		);

		this.subscription.add(
			this.getFinishedCPUBoundProcesses$
				.pipe(take(1))
				.subscribe((processes) => {
					this.finishedProcesses = processes.map((process) => ({
						...process,
						checked: false,
					}));
				})
		);
	}

	private scrollDialogContainerToBottom(): void {
		const dialogContainer = this.document.querySelector('.mat-dialog-content');

		if (!dialogContainer) return;

		dialogContainer.scrollTo({
			top: dialogContainer.scrollHeight,
			behavior: 'smooth',
		});
	}

	private changedChartLabels(colors: Array<string>): void {
		const yAxisLabelContainer = this.document.querySelector(
			'.apexcharts-yaxis-texts-g'
		);

		if (!yAxisLabelContainer) return;

		Array.from(yAxisLabelContainer.children).forEach(
			(child: any, index: number) => {
				child.style.fill = colors[index];
			}
		);
	}

	private removeDownloadCSVButton(): void {
		const downloadButton = this.document.querySelector('.exportCSV');

		if (!downloadButton) return;

		downloadButton.remove();
	}

	generateChart(): void {
		const checkedProcesses = this.finishedProcesses.filter(
			({ checked }) => checked
		);

		if (checkedProcesses.length === 0) return;

		const checkedProcessesPIDs = checkedProcesses.map(({ id }) => id);

		const allLogs = this.store.selectSnapshot(LogsState.getLogs) ?? [];

		const filteredLogs = allLogs.filter((log) => {
			const pid = log?.process?.id;
			return (
				pid != null &&
				checkedProcessesPIDs.includes(pid) &&
				this.logTime(log) != null
			);
		});

		if (filteredLogs.length === 0) {
			return;
		}

		const sortedLogs = [...filteredLogs].sort(
			(a, b) => this.logTime(a)! - this.logTime(b)!
		);

		const firstT = this.logTime(sortedLogs[0]!);
		if (firstT == null) {
			return;
		}

		const logsByPID = checkedProcessesPIDs.reduce<Array<Array<Log>>>(
			(result, pid) => {
				const logsForPID = sortedLogs.filter(
					({ process }) => process.id === pid
				);
				result.push(logsForPID);
				return result;
			},
			[]
		);

		const labelsColors = checkedProcesses.map((process) => process.color);

		const minTime = firstT;

		const data: Array<{
			x: string;
			y: Array<number>;
		}> = [];

		logsByPID.forEach((logs, index) => {
			if (logs.length < 2 || logs.length % 2 !== 0) {
				const wrongProcess = checkedProcesses[index];

				if (!wrongProcess) return;

				data.push({
					x: `PID ${wrongProcess.id}`,
					y: [],
				});
			} else {
				const logsHalfSize = Math.floor(logs.length / 2);

				for (let i = 0; i < logsHalfSize; i++) {
					const tStart = this.logTime(logs[i * 2]!);
					const tEnd = this.logTime(logs[i * 2 + 1]!);
					if (tStart == null || tEnd == null) {
						continue;
					}
					const start = tStart - minTime;
					const end = tEnd - minTime;

					const process = logs[i * 2]!.process;

					data.push({
						x: `PID ${process.id}`,
						y: [start, end],
					});
				}
			}
		});

		const barHeight = 40;

		setTimeout(() => {
			this.chartOptions = {
				series: [
					{
						name: 'Tempo de Vida',
						data,
					},
				],
				chart: {
					height: logsByPID.length * barHeight + 100,
					type: 'rangeBar',
				},
				plotOptions: {
					bar: {
						horizontal: true,
						barHeight: barHeight + 'px',
						rangeBarGroupRows: true,
					},
				},
				dataLabels: {
					enabled: true,
				},
			};

			setTimeout(() => {
				this.changedChartLabels(labelsColors);
				this.scrollDialogContainerToBottom();
				this.removeDownloadCSVButton();
			}, 0);
		}, 0);
	}

	getTypeName(type: ProcessTypesType): string {
		return ProcessTypesNames[type];
	}

	onCheck(event: MatCheckboxChange, processIndex: number): void {
		const process = this.finishedProcesses[processIndex];

		process.checked = event.checked;
	}

	onCheckAll(event: MatCheckboxChange): void {
		const aux = this.finishedProcesses.map((process) => ({
			...process,
			checked: event.checked,
		}));

		this.finishedProcesses = [...aux];
	}

	handleFullscreenDialog(): void {
		this.isFullscreen = !this.isFullscreen;

		const dialogBackdrop = this.document.querySelector('.cdk-overlay-pane');

		if (!dialogBackdrop) return;

		if (this.isFullscreen) {
			dialogBackdrop?.classList.add('mx-none');
			this.dialogRef.updateSize('100%', '100%');
		} else {
			dialogBackdrop?.classList.remove('mx-none');
			this.dialogRef.updateSize('80%');
		}
	}

	onClose() {
		this.dialogRef.close();
	}

	ngOnInit(): void {
		this.getFinishedProcesses();
	}

	ngOnDestroy(): void {
		this.subscription.unsubscribe();
	}
}
