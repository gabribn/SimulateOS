import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { MemoryManagerComponent } from './memory-manager.component';

const routes: Routes = [
	{
		path: '',
		component: MemoryManagerComponent
	}
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class MemoryManagerRoutingModule { }
