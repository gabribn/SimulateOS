import { ProcessStatesType } from '../../constants/process-states.constants';
import { ScalingTypesEnum } from '../../constants/scaling-types.constants';
import { CreateProcessDTO, Process } from '../../models/process';

export namespace Processes {
	export class CreateProcess {
		static readonly type = '[Processes] Create Process';
		payload: any;
		constructor(public process: CreateProcessDTO) {}
	}

	export class EditProcess {
		static readonly type = '[Processes] Edit Process';
		constructor(public process: Process, public processDTO: CreateProcessDTO) {}
	}

	export class UpdateProcessState {
		static readonly type = '[Processes] Update Process State';
		constructor(public process: Process, public state: ProcessStatesType) {}
	}

	export class UpdateProcessPriority {
		static readonly type = '[Processes] Update Process Priority';
		constructor(public process: Process, public priority: number) {}
	}

	export class IncrementTimer {
		static readonly type = '[Processes] Increment Timer';
		constructor() {}
	}

	export class SetIOWaitTime {
		static readonly type = '[Processes] Set IO Wait Time';
		constructor(public time: number) {}
	}

	export class SetTimeSlice {
		static readonly type = '[Processes] Set Time Slice';
		constructor(public time: number) {}
	}

	export class StopProcesses {
		static readonly type = '[Processes] Stop Processes';
		constructor() {}
	}

	export class PickScalingType {
		static readonly type = '[Processes] Pick Scaling Type';
		constructor(public scalingType: ScalingTypesEnum) {}
	}

	export class ResetState {
		static readonly type = '[Processes] Reset State';
		constructor() {}
	}
}
