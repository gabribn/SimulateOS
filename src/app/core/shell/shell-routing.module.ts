import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ShellComponent } from './shell.component';

const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      {
        path: '',
        loadChildren: () =>
          import('../../modules/process-manager/process-manager.module').then(
            (m) => m.ProcessManagerModule
          ),
      },
			{
				path: 'memory-manager',
				loadChildren: () => import('../../modules/memory-manager/memory-manager.module').then(m => m.MemoryManagerModule)
			}
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ShellRoutingModule {}
