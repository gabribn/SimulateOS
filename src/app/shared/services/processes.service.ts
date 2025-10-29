import { Injectable } from '@angular/core';
import { Observable, concatMap, delay, from, of, toArray } from 'rxjs';

import { ProcessColors } from '../constants/process-colors.constants';
import { ProcessStates } from '../constants/process-states.constants';
import {
	ProcessTypes,
	ProcessTypesType,
} from '../constants/process-types.constants';
import { ScalingTypesEnum } from '../constants/scaling-types.constants';
import { GenericSelectData } from '../models/generic-select-data';
import { CreateProcessDTO, Process } from '../models/process';
import { ScalingTypeDescriptionPipe } from '../pipes/scaling-type-description.pipe';

@Injectable({
	providedIn: 'root',
})
export class ProcessesService {
	private generateId(): string {
		const date = new Date();
		return `${date.getMinutes()}${date.getSeconds()}${date.getMilliseconds()}`;
	}

	private generateColor(color: string, currentIndex: number): string {
		const randomIndex = this.getRandomNumber();

		let generatedColor = ProcessColors[randomIndex].color;

		if (currentIndex === 0) {
			const foundColor = ProcessColors.find(
				(item) => item.color === color && item.isAvailable
			);

			if (foundColor) generatedColor = foundColor.color;
		}

		ProcessColors.find((item) => item.color === generatedColor)!.isAvailable =
			false;

		return generatedColor;
	}

	private getRandomNumber(): number {
		const availableColors = ProcessColors.length;
		return Math.floor(Math.random() * (availableColors - 1));
	}

	public createProcess(
		process: CreateProcessDTO,
		time: number
	): Observable<Process[]> {
		return from(Array.from(Array(process.number).keys())).pipe(
			concatMap((index) =>
				of({
					id: this.generateId(),
					priority: process.priority,
					color: this.generateColor(process.color, index),
					type: process.type,
					state: ProcessStates.ready,
					cpuTime: 0,
					timeCreated: time,
					processTimeToFinish: process.processTimeToFinish,
					executingTime: 0,
					currentType: this.getProcessType(process.type),
					memoryBlocksRequired: process.memoryBlocksRequired,
					allocatedBlocks: process.allocatedBlocks ?? Array.from({ length: process.memoryBlocksRequired }, (_, i) => i + 1), // Gera blocos se não existirem
					pages: process.pages,
				}).pipe(delay(50))
			),
			toArray()
		);
	}

	public getScalingTypesSelectData(): GenericSelectData<ScalingTypesEnum>[] {
		const scalingTypes = Object.values(ScalingTypesEnum).filter(
			(value) => typeof value === 'number'
		) as Array<ScalingTypesEnum>;

		return scalingTypes.map((scalingType) => ({
			id: scalingType,
			description: new ScalingTypeDescriptionPipe().transform(scalingType),
		}));
	}

	public getProcessType(type: ProcessTypesType): ProcessTypesType {
		let value = type;

		if (type === ProcessTypes.cpuAndIoBound) {
			const types = [ProcessTypes.cpuBound, ProcessTypes.ioBound];

			value = types[Math.floor(Math.random() * types.length)];
		}

		return value;
	}
}
