import { CreateLogDTO } from '../../models/log';

export namespace Logs {
	export class CreateLog {
		static readonly type = '[Logs] Create Log';
		constructor(public createLog: CreateLogDTO) {}
	}

	export class ClearLogs {
		static readonly type = '[Logs] Clear Logs';
		constructor() {}
	}

	export class ResetState {
		static readonly type = '[Logs] Reset State';
		constructor() {}
	}
}
