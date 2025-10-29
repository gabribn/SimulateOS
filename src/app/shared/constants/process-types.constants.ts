export type ProcessTypesType = 'cpuBound' | 'ioBound' | 'cpuAndIoBound';

export interface IProcessTypes {
  cpuBound: ProcessTypesType;
  ioBound: ProcessTypesType;
  cpuAndIoBound: ProcessTypesType;
}

export const ProcessTypes: IProcessTypes = {
  cpuBound: 'cpuBound',
  ioBound: 'ioBound',
  cpuAndIoBound: 'cpuAndIoBound',
};

export const ProcessTypesNames = {
  cpuBound: 'CPU-bound',
  ioBound: 'IO-bound',
  cpuAndIoBound: 'CPU e IO-bound',
};
