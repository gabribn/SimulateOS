import { Component, OnInit } from '@angular/core';
import { Store } from '@ngxs/store';

import PACKAGE_JSON from '../../package.json';
import { Logs } from './shared/stores/logs/logs.actions';
import { Processes } from './shared/stores/processes/processes.actions';
import { BlocksAction } from './shared/stores/blocks/blocks.action';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
	constructor(private readonly store: Store) {}

	private clearNGXStorage(): void {
		this.store.dispatch(new Processes.ResetState());
		this.store.dispatch(new Logs.ResetState());
		this.store.dispatch(new BlocksAction.ResetState());
	}

	private verifyCurrentVersion(): void {
		const localStorageVersion = localStorage.getItem('simulateOSVersion');

		if (localStorageVersion) {
			if (localStorageVersion !== PACKAGE_JSON.version) {
				this.clearNGXStorage();
				localStorage.setItem('simulateOSVersion', PACKAGE_JSON.version);
			}
		} else {
			localStorage.setItem('simulateOSVersion', PACKAGE_JSON.version);
		}
	}

	ngOnInit(): void {
		this.verifyCurrentVersion();
	}
}
