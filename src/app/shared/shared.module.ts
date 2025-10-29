import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { IconComponent } from './components/icon/icon.component';
import { ScalingTypeDescriptionPipe } from './pipes/scaling-type-description.pipe';
import { HeaderComponent } from './components/header/header.component';
import { BlockScalingTypeDescriptionPipe } from './pipes/block-scaling-type-description.pipe';
import { CreateProcessDialogComponent } from './components/create-process-dialog/create-process-dialog.component';
import { ColorPickerDialogComponent } from './components/color-picker-dialog/color-picker-dialog.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { ReactiveFormsModule } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

const modules = [IconComponent, ScalingTypeDescriptionPipe, HeaderComponent, BlockScalingTypeDescriptionPipe, CreateProcessDialogComponent, ColorPickerDialogComponent];
@NgModule({
	imports: [CommonModule, MatIconModule, MatFormFieldModule, ReactiveFormsModule, MatSelectModule, MatInputModule, MatButtonModule],
	declarations: [...modules],
	exports: [...modules],
})
export class SharedModule {}
