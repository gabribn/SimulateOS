import { Process } from '../../models/process';
import { BlocksScalingTypesEnum } from '../../constants/blocks-types.contants';

export namespace BlocksAction {
  export class AllocateBlocks {
    static readonly type = '[Blocks] Allocate Blocks';
    constructor(public payload: { process: Process; memoryBlocksRequired: number}) {}
  }

	export class ReleaseBlockById {
		static readonly type = '[Blocks] Release Block By Id';
		constructor(public id: string) {}
	}

  export class ReleaseBlocks {
    static readonly type = '[Blocks] Release Blocks';
    constructor(public payload: Process) {}
  }

	export class PickBlockScalingType {
		static readonly type = '[Blocks] Pick Block Scaling Type';
		constructor(public scalingType: BlocksScalingTypesEnum) {}
	}

  export class ResetState {
    static readonly type = '[Blocks] Reset State';
  }

  export class BringToPhysicalMemory {
      static readonly type = '[Blocks] Bring To Physical Memory';
      constructor(public process: Process) {}
  }

  export class ClearReferenceBits {
    static readonly type = '[Blocks] Clear Reference Bits';
  }

}
