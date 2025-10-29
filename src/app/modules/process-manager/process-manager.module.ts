import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { NgApexchartsModule } from 'ng-apexcharts';

import { SharedModule } from 'src/app/shared/shared.module';
import { EditProcessDialogComponent } from '../../shared/components/edit-process-dialog/edit-process-dialog.component';
import { ProcessLifetimeDialogComponent } from './components/process-lifetime-dialog/process-lifetime-dialog.component';
import { UpdatePriorityDialogComponent } from './components/update-priority-dialog/update-priority-dialog.component';
import { ProcessManagerRoutingModule } from './process-manager-routing.module';
import { ProcessManagerComponent } from './process-manager.component';
import { ProcessesStatsComponent } from './components/processes-stats/processes-stats.component';
import { PickScalingTypeDialogComponent } from './components/pick-scaling-type-dialog/pick-scaling-type-dialog.component';

@NgModule({
	imports: [
		CommonModule,
		ProcessManagerRoutingModule,
		MatIconModule,
		MatTableModule,
		MatChipsModule,
		MatButtonModule,
		ReactiveFormsModule,
		MatFormFieldModule,
		MatInputModule,
		MatDialogModule,
		MatSelectModule,
		MatMenuModule,
		SharedModule,
		MatCheckboxModule,
		NgApexchartsModule,
	],
	declarations: [
		ProcessManagerComponent,
		EditProcessDialogComponent,
		UpdatePriorityDialogComponent,
		ProcessLifetimeDialogComponent,
		ProcessesStatsComponent,
		PickScalingTypeDialogComponent
	],
})
export class ProcessManagerModule {}
