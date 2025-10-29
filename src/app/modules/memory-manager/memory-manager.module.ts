import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

import { MemoryManagerRoutingModule } from './memory-manager-routing.module';
import { MemoryManagerComponent } from './memory-manager.component';
import { SharedModule } from "../../shared/shared.module";
import { MatIconModule } from '@angular/material/icon';
import { PickBlockScalingTypeDialogComponent } from './components/pick-block-scaling-type-dialog/pick-block-scaling-type-dialog.component';
import { ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule } from '@angular/material/dialog';


@NgModule({
  declarations: [
    MemoryManagerComponent,
    PickBlockScalingTypeDialogComponent
  ],
  imports: [
    CommonModule,
    MemoryManagerRoutingModule,
    MatButtonModule,
    SharedModule,
		MatIconModule,
		ReactiveFormsModule,
		MatFormFieldModule,
		MatSelectModule,
		MatDialogModule
]
})
export class MemoryManagerModule { }
