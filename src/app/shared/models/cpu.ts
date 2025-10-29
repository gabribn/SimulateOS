import { Process } from './process';

export interface CPU {
  execution?: Process;
  waiting: WaitingList[];
}

export interface WaitingList {
  priority: number;
  processes: Process[];
}
