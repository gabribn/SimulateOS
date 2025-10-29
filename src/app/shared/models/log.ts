import { Process } from './process';

export interface Log {
	id: string;
	process: Process;
	currentTime: number;
}

export interface CreateLogDTO {
	process: Process;
	timer: number;
}
