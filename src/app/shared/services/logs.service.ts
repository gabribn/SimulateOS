import { Injectable } from '@angular/core';
import { of } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

import { CreateLogDTO, Log } from '../models/log';

@Injectable({
	providedIn: 'root',
})
export class LogsService {
	public createLog({ process, timer }: CreateLogDTO) {
		const createdLog: Log = {
			id: uuidv4(),
			process,
			currentTime: timer,
		};

		return of(createdLog);
	}
}
