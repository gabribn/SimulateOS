import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext, Store } from '@ngxs/store';
import { tap } from 'rxjs';

import { Color, ProcessColors } from '../../constants/process-colors.constants';
import { ProcessStates } from '../../constants/process-states.constants';
import { ProcessTypes } from '../../constants/process-types.constants';
import { ScalingTypesEnum } from '../../constants/scaling-types.constants';
import { Process } from '../../models/process';
import { ProcessesService } from '../../services/processes.service';
import { Logs } from '../logs/logs.actions';
import { Processes } from './processes.actions';
import { BlocksAction } from '../blocks/blocks.action';


export interface ProcessesStateModel {
	data: Process[];
	colors: Color[];
	timer: number;
	ioWaitTime: number;
	timeSlice: number;
	scalingType: ScalingTypesEnum;
	displayedColumns: Array<string>;
}

export const PROCESSES_STATE_INITIAL_STATE: ProcessesStateModel = {
	data: [],
	colors: [],
	timer: 0,
	ioWaitTime: 1,
	timeSlice: 2,
	scalingType: ScalingTypesEnum.Circular,
	displayedColumns: ['id', 'cpuTime', 'processTimeToFinish'],
};

@State<ProcessesStateModel>({
	name: 'simulateOSProcesses',
	defaults: { ...PROCESSES_STATE_INITIAL_STATE },
})
@Injectable()
export class ProcessesState {
	constructor(private processesService: ProcessesService, private store: Store) {
		this.loadStateFromLocalStorage();
		window.addEventListener(
			'storage',
			this.syncStateFromLocalStorage.bind(this)
		);
	}

	@Selector()
	static getAvailableProcesses(state: ProcessesStateModel) {
		return state.data.filter((item) => item.state !== ProcessStates.finished);
	}

	@Selector()
	static getCurrentScalingType(state: ProcessesStateModel): ScalingTypesEnum {
		return state.scalingType;
	}

	@Selector()
	static getExecutingProcess(state: ProcessesStateModel) {
		return state.data.find(({ state }) => state === ProcessStates.execution);
	}

	@Selector()
	static getIOProcess(state: ProcessesStateModel) {
		return state.data.find(
			({ currentType, state }) =>
				currentType === ProcessTypes.ioBound &&
				state === ProcessStates.ioExecution
		);
	}

	@Selector()
	static getReadyProcesses(state: ProcessesStateModel) {
		const { scalingType, data } = state;

		const readyProcesses = data.filter(
			({ state }) => state === ProcessStates.ready
		);

		switch (scalingType) {
			case ScalingTypesEnum.CircularWithPriorities:
				readyProcesses.sort((a, b) => b.priority - a.priority);
				break;
			case ScalingTypesEnum.ShortestRemainingTimeNext:
				readyProcesses.sort(
					(a, b) =>
						a.processTimeToFinish -
						a.cpuTime -
						(b.processTimeToFinish - b.cpuTime)
				);
				break;
			default:
				break;
		}

		return readyProcesses;
	}

	@Selector()
	static getSuspendedProcesses(state: ProcessesStateModel) {
		return state.data.filter((item) => item.state === ProcessStates.suspended);
	}

	@Selector()
	static getFinishedProcesses(state: ProcessesStateModel) {
		return state.data.filter(({ state }) => state === ProcessStates.finished);
	}


	@Selector()
  static getNotFinishedProcesses(state: ProcessesStateModel): Process[] {
    return state.data.filter(process => process.state != 'finished'); // ou qualquer status inicial
  }

	@Selector()
	static getFinishedCPUBoundProcesses(state: ProcessesStateModel) {
		return state.data.filter(
			({ state, type }) =>
				state === ProcessStates.finished && type === ProcessTypes.cpuBound
		);
	}

	@Selector()
	static getSuspendedAndFinishedProcesses(state: ProcessesStateModel) {
		const suspendedProcesses = state.data.filter(
			({ state }) => state === ProcessStates.suspended
		);
		const finishedProcesses = state.data.filter(
			({ state }) => state === ProcessStates.finished
		);

		return [...suspendedProcesses, ...finishedProcesses];
	}

	@Selector()
	static getIOQueueProcesses(state: ProcessesStateModel) {
		return state.data.filter(
			({ state, currentType }) =>
				state === ProcessStates.ioReady && currentType === ProcessTypes.ioBound
		);
	}

	@Selector()
	static getTimer(state: ProcessesStateModel) {
		return state.timer;
	}

	@Selector()
	static getTimeSlice(state: ProcessesStateModel) {
		return state.timeSlice;
	}

	@Selector()
	static getIOWaitTime(state: ProcessesStateModel) {
		return state.ioWaitTime;
	}

	@Selector()
	static getCPU(state: ProcessesStateModel) {
		const execution = state.data.find(
			(item) => item.state === ProcessStates.execution
		);
		const waiting = Array.from(Array(16).keys())
			.map((_, index) => ({
				priority: index,
				processes: state.data.filter(
					(item) =>
						item.priority === index && item.state === ProcessStates.ready
				),
			}))
			.reverse();

		return {
			execution,
			waiting,
		};
	}

	@Selector()
	static getDisplayedColumns(state: ProcessesStateModel) {
		return state.displayedColumns;
	}

	private getDisplayedColumnsByScalingType(
		scalingType: ScalingTypesEnum
	): Array<string> {
		let columns: Array<string> = [];

		switch (scalingType) {
			case ScalingTypesEnum.Circular:
			case ScalingTypesEnum.FirstInFirstOut:
			case ScalingTypesEnum.ShortestRemainingTimeNext:
				columns = ['id', 'cpuTime', 'processTimeToFinish'];
				break;
			case ScalingTypesEnum.CircularWithPriorities:
				columns = ['id', 'priority', 'cpuTime', 'processTimeToFinish'];
				break;
			default:
				break;
		}

		return columns;
	}

	@Action(Processes.PickScalingType)
	pickScalingType(
		context: StateContext<ProcessesStateModel>,
		action: Processes.PickScalingType
	) {
		context.patchState({
			scalingType: action.scalingType,
			displayedColumns: this.getDisplayedColumnsByScalingType(
				action.scalingType
			),
		});

		context.dispatch(new Processes.StopProcesses());

		this.runCPU(context);
		this.runIO(context);
	}

	@Action(Processes.CreateProcess)
	createProcess(
		context: StateContext<ProcessesStateModel>,
		action: Processes.CreateProcess
	) {
		const state = context.getState();
		// action.process.memoryBlocksRequired = 1;

		const indexOfFirstProcessWithLessPriority = state.data.findIndex(
			(item) => item.priority < action.process.priority
		);

		if (indexOfFirstProcessWithLessPriority === -1) {
			return this.processesService
				.createProcess(action.process, state.timer)
				.pipe(
					tap((res) => {
						context.patchState({
							data: [...state.data, ...res],
							colors: ProcessColors,
						});

						const teste = res.map((process)=> new BlocksAction.AllocateBlocks({process: process, memoryBlocksRequired: process.memoryBlocksRequired}))

						context.dispatch(teste);
					})
				);
		} else {
			return this.processesService
				.createProcess(action.process, state.timer)
				.pipe(
					tap((res) => {
						state.data.splice(
							indexOfFirstProcessWithLessPriority === 0
								? 0
								: indexOfFirstProcessWithLessPriority,
							0,
							...res
						);

						context.patchState({
							data: [...state.data],
							colors: ProcessColors,
						});
						const teste = res.map((process)=> new BlocksAction.AllocateBlocks({process: process, memoryBlocksRequired: process.memoryBlocksRequired}))

						context.dispatch(teste);
					})
				);
		}
	}

	@Action(Processes.EditProcess)
	editProcess(
		context: StateContext<ProcessesStateModel>,
		action: Processes.EditProcess
	) {
		const state = context.getState();
		const index = state.data.findIndex((item) => item.id === action.process.id);

		ProcessColors.forEach((item) => {
			if (item.color === action.process.color) item.isAvailable = true;
			else if (item.color === action.processDTO.color) item.isAvailable = false;
		});

		state.data[index] = {
			...action.process,
			priority: action.processDTO.priority,
			type: action.processDTO.type,
			color: action.processDTO.color,
			state: action.processDTO.state!,
		};

		if (action.process.priority !== action.processDTO.priority) {
			const decreasedPriority =
				action.process.priority > action.processDTO.priority;

			const dataWithoutExecutingProcess = state.data.filter(
				(item) => item.id !== action.process.id
			);
			const indexOfFirstProcessWithLessPriority = state.data.findIndex(
				(item) => item.priority < state.data[index].priority
			);

			if (indexOfFirstProcessWithLessPriority === -1) {
				state.data = [...dataWithoutExecutingProcess, state.data[index]];
			} else {
				dataWithoutExecutingProcess.splice(
					indexOfFirstProcessWithLessPriority === 0
						? 0
						: decreasedPriority
						? indexOfFirstProcessWithLessPriority - 1
						: indexOfFirstProcessWithLessPriority,
					0,
					state.data[index]
				);

				state.data = dataWithoutExecutingProcess;
			}
		}

		context.patchState({
			data: [...state.data],
			colors: ProcessColors,
		});

		this.saveStateToLocalStorage(context.getState());
	}

	@Action(Processes.UpdateProcessState)
	updateProcessState(
		context: StateContext<ProcessesStateModel>,
		action: Processes.UpdateProcessState
	) {
		const { data, timer } = context.getState();
		const index = data.findIndex((item) => item.id === action.process.id);

		const updatedProcess: Process = { ...action.process, state: action.state };

		if (
			updatedProcess.type === ProcessTypes.cpuAndIoBound &&
			updatedProcess.state === ProcessStates.ready
		) {
			updatedProcess.currentType = this.processesService.getProcessType(
				ProcessTypes.cpuAndIoBound
			);
		}

		data[index] = updatedProcess;

		if (action.process.currentType === ProcessTypes.cpuBound) {
			context.dispatch(
				new Logs.CreateLog({
					process: updatedProcess,
					timer,
				})
			);
		}

		if (action.state === ProcessStates.finished) {
			context.dispatch(new BlocksAction.ReleaseBlocks(action.process));
		}

		context.patchState({
			data: [...data],
		});
		this.saveStateToLocalStorage(context.getState());
	}

	@Action(Processes.UpdateProcessPriority)
	updateProcessPriority(
		context: StateContext<ProcessesStateModel>,
		action: Processes.UpdateProcessPriority
	) {
		const state = context.getState();
		const data = state.data;
		const index = data.findIndex((item) => item.id === action.process.id);

		data[index] = { ...action.process, priority: action.priority };

		context.patchState({ data: [...data] });
	}

	@Action(Processes.SetIOWaitTime)
	setIOWaitTIme(
		context: StateContext<ProcessesStateModel>,
		action: Processes.SetIOWaitTime
	) {
		context.patchState({ ioWaitTime: action.time });
	}

	@Action(Processes.SetTimeSlice)
	setTimeSlice(
		context: StateContext<ProcessesStateModel>,
		action: Processes.SetTimeSlice
	) {
		context.patchState({ timeSlice: action.time });
	}


@Action(Processes.IncrementTimer)
incrementTimer(context: StateContext<ProcessesStateModel>) {
    const highResolutionTime = performance.now(); 

    context.patchState({
        timer: highResolutionTime, 
    });

    this.runCPU(context);
    this.runIO(context);
}

	private runCircularProcess(
		currentExecutingProcess: Process,
		context: StateContext<ProcessesStateModel>
	): void {
		const { data: processes, timeSlice } = context.getState();

		const coolDown =
			currentExecutingProcess.currentType === ProcessTypes.cpuBound
				? timeSlice
				: 1;

		currentExecutingProcess.executingTime += 1;
		currentExecutingProcess.cpuTime += 1;

		const dataWithoutExecutingProcess = processes.filter(
			({ id }) => id !== currentExecutingProcess.id
		);

		if (currentExecutingProcess.executingTime >= coolDown) {
			currentExecutingProcess.executingTime = 0;

			if (
				currentExecutingProcess.cpuTime >=
				currentExecutingProcess.processTimeToFinish
			) {
				context.patchState({
					data: [...dataWithoutExecutingProcess, currentExecutingProcess],
				});

				context.dispatch(
					new Processes.UpdateProcessState(
						currentExecutingProcess,
						ProcessStates.finished
					)
				);

				return;
			}

			if (currentExecutingProcess.currentType === ProcessTypes.ioBound)
				currentExecutingProcess.executingTime = 0;

			context.patchState({
				data: [...dataWithoutExecutingProcess, currentExecutingProcess],
			});

			context.dispatch(
				new Processes.UpdateProcessState(
					currentExecutingProcess,
					currentExecutingProcess.currentType === ProcessTypes.cpuBound
						? ProcessStates.ready
						: ProcessStates.ioReady
				)
			);

			return;
		}

		if (
			currentExecutingProcess.cpuTime >=
			currentExecutingProcess.processTimeToFinish
		) {
			context.patchState({
				data: [...dataWithoutExecutingProcess, currentExecutingProcess],
			});

			context.dispatch(
				new Processes.UpdateProcessState(
					currentExecutingProcess,
					ProcessStates.finished
				)
			);
		}
	}

	private runFirstProcess(context: StateContext<ProcessesStateModel>): void {
		const state = context.getState();

		const firstProcess = state.data.find(
			({ state }) => state === ProcessStates.ready
		);

		if (!firstProcess) return;

		context.dispatch(
			new Processes.UpdateProcessState(firstProcess, ProcessStates.execution)
		);
	}

	private runCPUByCircularType(
		context: StateContext<ProcessesStateModel>
	): void {
		const state = context.getState();

		const currentExecutingProcess = state.data.find(
			({ state }) => state === ProcessStates.execution
		);

		if (currentExecutingProcess) {
			this.runCircularProcess(currentExecutingProcess, context);
		} else {
			this.runFirstProcess(context);
		}
	}

	private runHighestPriorityProcess(
		context: StateContext<ProcessesStateModel>
	): void {
		const state = context.getState();

		const readyProcesses = state.data.filter(
			({ state }) => state === ProcessStates.ready
		);

		const highestPriority = readyProcesses.reduce((prv, cur) =>
			prv.priority > cur.priority ? prv : cur
		).priority;

		const highestPriorityProcess = state.data.find(
			(item) =>
				item.priority === highestPriority && item.state === ProcessStates.ready
		);

		if (!highestPriorityProcess) return;

		context.dispatch(
			new Processes.UpdateProcessState(
				highestPriorityProcess,
				ProcessStates.execution
			)
		);
	}

	private runCPUByCircularWithPrioritiesType(
		context: StateContext<ProcessesStateModel>
	): void {
		const state = context.getState();

		const currentExecutingProcess = state.data.find(
			({ state }) => state === ProcessStates.execution
		);

		if (currentExecutingProcess) {
			this.runCircularProcess(currentExecutingProcess, context);
		} else {
			this.runHighestPriorityProcess(context);
		}
	}

	private runFirstInFirstOutProcess(
		currentExecutingProcess: Process,
		context: StateContext<ProcessesStateModel>
	): void {
		const { data: processes } = context.getState();

		currentExecutingProcess.executingTime += 1;
		currentExecutingProcess.cpuTime += 1;

		const dataWithoutExecutingProcess = processes.filter(
			({ id }) => id !== currentExecutingProcess.id
		);

		if (
			currentExecutingProcess.cpuTime >=
			currentExecutingProcess.processTimeToFinish
		) {
			context.patchState({
				data: [...dataWithoutExecutingProcess, currentExecutingProcess],
			});

			context.dispatch(
				new Processes.UpdateProcessState(
					currentExecutingProcess,
					ProcessStates.finished
				)
			);
		}

		if (currentExecutingProcess.currentType === ProcessTypes.ioBound) {
			currentExecutingProcess.executingTime = 0;

			context.patchState({
				data: [...dataWithoutExecutingProcess, currentExecutingProcess],
			});

			context.dispatch(
				new Processes.UpdateProcessState(
					currentExecutingProcess,
					ProcessStates.ioReady
				)
			);
		}
	}

	private runCPUByFirstInFirstOutType(
		context: StateContext<ProcessesStateModel>
	): void {
		const state = context.getState();

		const currentExecutingProcess = state.data.find(
			({ state }) => state === ProcessStates.execution
		);

		if (currentExecutingProcess) {
			this.runFirstInFirstOutProcess(currentExecutingProcess, context);
		} else {
			this.runFirstProcess(context);
		}
	}

	private runShortestRemainingTime(
		context: StateContext<ProcessesStateModel>
	): void {
		const state = context.getState();

		const readyProcesses = state.data.filter(
			({ state }) => state === ProcessStates.ready
		);

		const aux = [...readyProcesses];

		aux.sort(
			(a, b) =>
				a.processTimeToFinish - a.cpuTime - (b.processTimeToFinish - b.cpuTime)
		);

		const shortestRemainingTimeProcess = aux[0];

		if (!shortestRemainingTimeProcess) return;

		context.dispatch(
			new Processes.UpdateProcessState(
				shortestRemainingTimeProcess,
				ProcessStates.execution
			)
		);
	}

	private runCPUByShortestRemainingTimeNext(
		context: StateContext<ProcessesStateModel>
	): void {
		const state = context.getState();

		const currentExecutingProcess = state.data.find(
			({ state }) => state === ProcessStates.execution
		);

		if (currentExecutingProcess) {
			this.runFirstInFirstOutProcess(currentExecutingProcess, context);
		} else {
			this.runShortestRemainingTime(context);
		}
	}

	private runCPUByScalingType(
		context: StateContext<ProcessesStateModel>
	): void {
		const { scalingType } = context.getState();

		switch (scalingType) {
			case ScalingTypesEnum.Circular:
				this.runCPUByCircularType(context);
				break;
			case ScalingTypesEnum.CircularWithPriorities:
				this.runCPUByCircularWithPrioritiesType(context);
				break;
			case ScalingTypesEnum.FirstInFirstOut:
				this.runCPUByFirstInFirstOutType(context);
				break;
			case ScalingTypesEnum.ShortestRemainingTimeNext:
				this.runCPUByShortestRemainingTimeNext(context);
				break;
			default:
				break;
		}
	}

	private runCPU(context: StateContext<ProcessesStateModel>) {
		const state = context.getState();

		if (!state.data.length) return;

		const runnableProcesses = state.data.filter(({ state }) =>
			[ProcessStates.ready, ProcessStates.execution].includes(state)
		);

		if (!runnableProcesses.length) return;

		this.runCPUByScalingType(context);
		this.saveStateToLocalStorage(context.getState());
	}

	private runFirstIOProcess(context: StateContext<ProcessesStateModel>): void {
		const state = context.getState();

		const firstProcess = state.data.find(
			({ state }) => state === ProcessStates.ioReady
		);

		if (!firstProcess) return;

		context.dispatch(
			new Processes.UpdateProcessState(firstProcess, ProcessStates.ioExecution)
		);
	}

	private runIOProcess(
		currentExecutingProcess: Process,
		context: StateContext<ProcessesStateModel>
	): void {
		const { data, ioWaitTime } = context.getState();

		currentExecutingProcess.executingTime += 1;
		currentExecutingProcess.cpuTime += 1;

		const dataWithoutExecutingProcess = data.filter(
			({ id }) => id !== currentExecutingProcess.id
		);

		if (currentExecutingProcess.executingTime >= ioWaitTime) {
			currentExecutingProcess.executingTime = 0;

			if (
				currentExecutingProcess.cpuTime >=
				currentExecutingProcess.processTimeToFinish
			) {
				context.patchState({
					data: [...dataWithoutExecutingProcess, currentExecutingProcess],
				});

				context.dispatch(
					new Processes.UpdateProcessState(
						currentExecutingProcess,
						ProcessStates.finished
					)
				);

				return;
			}

			context.patchState({
				data: [...dataWithoutExecutingProcess, currentExecutingProcess],
			});

			context.dispatch(
				new Processes.UpdateProcessState(
					currentExecutingProcess,
					ProcessStates.ready
				)
			);
		}

		if (
			currentExecutingProcess.cpuTime >=
			currentExecutingProcess.processTimeToFinish
		) {
			context.patchState({
				data: [...dataWithoutExecutingProcess, currentExecutingProcess],
			});

			context.dispatch(
				new Processes.UpdateProcessState(
					currentExecutingProcess,
					ProcessStates.finished
				)
			);
		}
	}

	private handleIOProcess(context: StateContext<ProcessesStateModel>): void {
		const state = context.getState();

		const currentExecutingProcess = state.data.find(
			({ state }) => state === ProcessStates.ioExecution
		);

		if (currentExecutingProcess) {
			this.runIOProcess(currentExecutingProcess, context);
		} else {
			this.runFirstIOProcess(context);
		}
	}

	private runIO(context: StateContext<ProcessesStateModel>) {
		const state = context.getState();

		if (!state.data.length) return;

		const runnableProcesses = state.data.filter(
			({ currentType, state }) =>
				currentType === ProcessTypes.ioBound &&
				[ProcessStates.ioReady, ProcessStates.ioExecution].includes(state)
		);

		if (!runnableProcesses.length) return;

		this.handleIOProcess(context);
		this.saveStateToLocalStorage(context.getState());
	}

	@Action(Processes.StopProcesses)
	stopProcesses(context: StateContext<ProcessesStateModel>) {
		ProcessColors.forEach((processColor) => {
			processColor.isAvailable = true;
		});

		context.patchState({
			data: [],
			ioWaitTime: 1,
			timeSlice: 2,
			timer: 0,
		});

		context.dispatch([new Logs.ClearLogs(), new BlocksAction.ResetState()]);
		this.saveStateToLocalStorage(context.getState());
	}

	@Action(Processes.ResetState)
	resetState(context: StateContext<ProcessesStateModel>) {
		context.setState({ ...PROCESSES_STATE_INITIAL_STATE });
	}

	private saveStateToLocalStorage(state: ProcessesStateModel) {
		localStorage.setItem('simulateOSProcesses', JSON.stringify(state));
	}

	private loadStateFromLocalStorage() {
		const localStorageState = localStorage.getItem('simulateOSProcesses');
		if (localStorageState) {
			this.store.reset({
				...this.store.snapshot(),
				simulateOSProcesses: JSON.parse(localStorageState),
			});
		}
	}

	private syncStateFromLocalStorage(event: StorageEvent) {
		if (event.key === 'simulateOSProcesses') {
			const localStorageState = JSON.parse(event.newValue || '{}');
			if (localStorageState) {
				this.store.reset({
					...this.store.snapshot(),
					simulateOSProcesses: localStorageState,
				});
			}
		}
	}

}
