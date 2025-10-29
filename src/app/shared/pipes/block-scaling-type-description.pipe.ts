import { Pipe, PipeTransform } from '@angular/core';

import { BlocksScalingTypesEnum } from '../constants/blocks-types.contants';

@Pipe({
	name: 'blockScalingTypeDescription',
})
export class BlockScalingTypeDescriptionPipe implements PipeTransform {
	transform(value: BlocksScalingTypesEnum | null): string {
		switch (value) {
			case BlocksScalingTypesEnum.BestFit:
				return 'Contigua - Best Fit';
			case BlocksScalingTypesEnum.FirstFit:
				return 'Contigua - First Fit';
			case BlocksScalingTypesEnum.WorstFit:
				return 'Contigua - Worst Fit';
				case BlocksScalingTypesEnum.FIFO:
					return 'Paginação - FIFO';
			case BlocksScalingTypesEnum.LRU:
					return 'Paginação - LRU';
			case BlocksScalingTypesEnum.NRU:
					return 'Paginação - NRU';
			default:
				return '--';
		}
	}
}
