import { Box } from './box';
import { Process } from './process';

export interface BoxLog {
  index: number;
  isEmpty: boolean;
  color?: string;
  process?: Process;
	box?: Box;
}

export interface CreateBoxLogDTO {
  index: number;
  isEmpty: boolean;
  color?: string;
  process?: Process;
	box?: Box;
	timer: number;
}
