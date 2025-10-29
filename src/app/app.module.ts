import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { MatNativeDateModule } from '@angular/material/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { NgxsReduxDevtoolsPluginModule } from '@ngxs/devtools-plugin';
import { NgxsStoragePluginModule } from '@ngxs/storage-plugin';
import { NgxsModule } from '@ngxs/store';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LogsState } from './shared/stores/logs/logs.state';
import { ProcessesState } from './shared/stores/processes/processes.state';
import { BlocksState } from './shared/stores/blocks/blocks.state';

@NgModule({
	declarations: [AppComponent],
	imports: [
		BrowserModule,
		AppRoutingModule,
		BrowserAnimationsModule,
		HttpClientModule,
		MatNativeDateModule,
		NgxsStoragePluginModule.forRoot({
			key: [ProcessesState, LogsState, BlocksState],
		}),
		NgxsModule.forRoot([ProcessesState, LogsState, BlocksState]),
		// O modulo abaixo gera os logs via console
		// NgxsLoggerPluginModule.forRoot(),
		NgxsReduxDevtoolsPluginModule.forRoot(),
	],
	providers: [],
	bootstrap: [AppComponent],
})
export class AppModule {}
