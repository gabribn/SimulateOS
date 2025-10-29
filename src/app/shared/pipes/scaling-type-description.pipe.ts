import { Pipe, PipeTransform } from '@angular/core';

import { ScalingTypesEnum } from '../constants/scaling-types.constants';

@Pipe({
	name: 'scalingTypeDescription',
})
export class ScalingTypeDescriptionPipe implements PipeTransform {
	transform(value: ScalingTypesEnum | null): string {
		switch (value) {
			case ScalingTypesEnum.Circular:
				return 'Circular';
			case ScalingTypesEnum.CircularWithPriorities:
				return 'Circular com Prioridades';
			case ScalingTypesEnum.FirstInFirstOut:
				return 'FIFO';
			case ScalingTypesEnum.ShortestRemainingTimeNext:
				return 'SRTN';
			default:
				return '--';
		}
	}
}
