export type ProcessStatesType =
	| 'ready'
	| 'execution'
	| 'suspended'
	| 'finished'
	| 'ioReady'
	| 'ioExecution';

export interface IProcessStates {
	ready: ProcessStatesType;
	execution: ProcessStatesType;
	suspended: ProcessStatesType;
	finished: ProcessStatesType;
	ioReady: ProcessStatesType;
	ioExecution: ProcessStatesType;
}

export const ProcessStates: IProcessStates = {
	ready: 'ready',
	execution: 'execution',
	suspended: 'suspended',
	finished: 'finished',
	ioExecution: 'ioExecution',
	ioReady: 'ioReady',
};

export const ProcessStatesNames = {
	ready: 'Pronto',
	execution: 'Execução',
	suspended: 'Suspenso',
	finished: 'finished',
	ioExecution: 'Execução IO',
	ioReady: 'IO Pronto',
};

export const ProcessStatesColors = {
	ready: 'primary',
	execution: 'accent',
	suspended: 'warn',
	finished: 'finished',
	ioReady: 'primary',
	ioExecution: 'accent',
};
