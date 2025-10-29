import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ProcessManagerComponent } from './process-manager.component';

const routes: Routes = [
  {
    path: '',
    component: ProcessManagerComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ProcessManagerRoutingModule {}
