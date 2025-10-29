import { Component, OnInit } from '@angular/core';
import { Store } from '@ngxs/store';
import { Processes } from 'src/app/shared/stores/processes/processes.actions';

@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss']
})
export class ShellComponent implements OnInit {
  constructor(private readonly store: Store) { }

	startTimer() {
		setInterval(() => {
			this.store.dispatch(new Processes.IncrementTimer());
		}, 1000);
	}

  ngOnInit() {
		this.startTimer();
  }
}
