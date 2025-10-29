import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { SharedModule } from 'src/app/shared/shared.module';
import { NavbarComponent } from './components/navbar/navbar.component';
import { ShellRoutingModule } from './shell-routing.module';
import { ShellComponent } from './shell.component';

@NgModule({
	imports: [
		CommonModule,
		SharedModule,
		ShellRoutingModule,
		MatButtonModule,
		FormsModule,
		MatDialogModule,
		ReactiveFormsModule,
		MatSelectModule,
		MatFormFieldModule,
		MatInputModule,
		MatIconModule,
	],
	declarations: [
		ShellComponent,
		NavbarComponent,
	],
})
export class ShellModule {}
