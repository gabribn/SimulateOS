import { Process } from './process';

export interface Box {
  process: Process | null;
	index: number;
}

export interface CreateBoxDTO {
  index: number;
  isEmpty: boolean;
  color?: string;
  process?: Process;
}
