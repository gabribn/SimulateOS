import { Injectable } from '@angular/core';
import { Action, Selector, State, StateContext, Store } from '@ngxs/store';
import { tap } from 'rxjs/operators';
import { Log } from '../../models/log';
import { LogsService } from '../../services/logs.service';
import { Logs } from './logs.actions';

export interface LogsStateModel {
	data: Array<Log>;
}

export const LOGS_STATE_INITIAL_STATE: LogsStateModel = {
	data: [],
};

@State<LogsStateModel>({
	name: 'simulateOSLogs',
	defaults: { ...LOGS_STATE_INITIAL_STATE },
})
@Injectable()
export class LogsState {
	constructor(private readonly logsService: LogsService, private store: Store) {
		window.addEventListener('storage', this.syncStateFromLocalStorage.bind(this));
	}

	@Selector()
	static getLogs(state: LogsStateModel) {
		return state.data;
	}

	@Action(Logs.CreateLog)
	createLog(context: StateContext<LogsStateModel>, action: Logs.CreateLog) {
		const state = context.getState();

		return this.logsService.createLog(action.createLog).pipe(
			tap((createdLog) => {
				context.patchState({
					data: [...state.data, createdLog],
				});
			})
		);
	}

	@Action(Logs.ClearLogs)
	clearLogs(context: StateContext<LogsStateModel>) {
		context.patchState({ data: [] });
	}

	@Action(Logs.ResetState)
	resetState(context: StateContext<LogsStateModel>) {
		context.setState({ ...LOGS_STATE_INITIAL_STATE });
	}

	private syncStateFromLocalStorage(event: StorageEvent) {
		if (event.key === 'ngxs') {
			const localStorageState = JSON.parse(event.newValue || '{}').simulateOSLogs;
			if (localStorageState) {
				this.store.reset({ ...this.store.snapshot(), simulateOSLogs: localStorageState });
			}
		}
	}
}
