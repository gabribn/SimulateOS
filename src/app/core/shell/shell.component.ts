import { Component, OnDestroy, OnInit } from '@angular/core';
import { Store } from '@ngxs/store';
import { Processes } from 'src/app/shared/stores/processes/processes.actions';

const TIMER_LOCK_NAME = 'simulateOS-timer';

type LockManagerLike = {
	request(
		name: string,
		callback: (lock: unknown) => Promise<void>
	): Promise<void>;
};

type NavigatorWithLocks = Navigator & { locks?: LockManagerLike };

function getNavigatorLocks(): LockManagerLike | undefined {
	if (typeof navigator === 'undefined') return undefined;
	return (navigator as NavigatorWithLocks).locks;
}

@Component({
	selector: 'app-shell',
	templateUrl: './shell.component.html',
	styleUrls: ['./shell.component.scss'],
})
export class ShellComponent implements OnInit, OnDestroy {
	private readonly SESSION_TAB_ID_KEY = 'simulateOSTabId';
	private readonly TIMER_LEADER_KEY = 'simulateOSTimerLeader';
	private readonly LEADER_EXPIRE_MS = 2500;

	private tabId: string;
	private destroyed = false;

	private tickIntervalId: number | undefined;
	private leaderCheckIntervalId: number | undefined;

	constructor(private readonly store: Store) {
		const existing = sessionStorage.getItem(this.SESSION_TAB_ID_KEY);
		if (existing) {
			this.tabId = existing;
		} else {
			this.tabId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
			sessionStorage.setItem(this.SESSION_TAB_ID_KEY, this.tabId);
		}
	}

	ngOnInit(): void {
		if (getNavigatorLocks()) {
			void this.runLocksTimerLoop();
		} else {
			this.startLeaderElectionFallback();
		}
	}

	ngOnDestroy(): void {
		this.destroyed = true;
		if (this.leaderCheckIntervalId) {
			window.clearInterval(this.leaderCheckIntervalId);
			this.leaderCheckIntervalId = undefined;
		}
		this.stopTimerIfRunning();
	}

	private async runLocksTimerLoop(): Promise<void> {
		const locks = getNavigatorLocks();
		if (!locks) {
			this.startLeaderElectionFallback();
			return;
		}
		while (!this.destroyed) {
			try {
				await locks.request(TIMER_LOCK_NAME, async () => {
					while (!this.destroyed) {
						await new Promise<void>((resolve) => setTimeout(resolve, 1000));
						if (this.destroyed) {
							break;
						}
						this.store.dispatch(new Processes.IncrementTimer());
					}
				});
			} catch {
				if (!this.destroyed) {
					this.startLeaderElectionFallback();
				}
				return;
			}
		}
	}

	private getLeaderState(): { id: string; heartbeat: number } | null {
		try {
			const raw = localStorage.getItem(this.TIMER_LEADER_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			if (!parsed?.id || typeof parsed.heartbeat !== 'number') return null;
			return parsed;
		} catch {
			return null;
		}
	}

	private tryBecomeLeader(): boolean {
		const now = Date.now();
		localStorage.setItem(
			this.TIMER_LEADER_KEY,
			JSON.stringify({ id: this.tabId, heartbeat: now })
		);
		return this.getLeaderState()?.id === this.tabId;
	}

	private startTimerIfNeeded(): void {
		if (this.tickIntervalId) return;
		this.tickIntervalId = window.setInterval(() => {
			const leader = this.getLeaderState();
			if (!leader || leader.id !== this.tabId) {
				this.stopTimerIfRunning();
				return;
			}
			this.store.dispatch(new Processes.IncrementTimer());
		}, 1000);
	}

	private stopTimerIfRunning(): void {
		if (!this.tickIntervalId) return;
		window.clearInterval(this.tickIntervalId);
		this.tickIntervalId = undefined;
	}

	private startLeaderElectionFallback(): void {
		if (this.leaderCheckIntervalId) return;

		this.leaderCheckIntervalId = window.setInterval(() => {
			const leader = this.getLeaderState();
			const now = Date.now();

			if (!leader || now - leader.heartbeat > this.LEADER_EXPIRE_MS) {
				if (this.tryBecomeLeader()) {
					this.startTimerIfNeeded();
				} else {
					this.stopTimerIfRunning();
				}
				return;
			}

			if (leader.id === this.tabId) {
				localStorage.setItem(
					this.TIMER_LEADER_KEY,
					JSON.stringify({ id: this.tabId, heartbeat: now })
				);
				this.startTimerIfNeeded();
				return;
			}

			this.stopTimerIfRunning();
		}, 500);
	}
}
