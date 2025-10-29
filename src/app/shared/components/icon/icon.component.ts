import { Component, Input, OnInit } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MatIconRegistry } from '@angular/material/icon';

@Component({
  selector: 'app-icon',
  templateUrl: './icon.component.html',
})
export class IconComponent implements OnInit {
  @Input() name = '';
  @Input() size?: number;

  constructor(
    private iconRegistry: MatIconRegistry,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit() {
    this.iconRegistry.addSvgIcon(
      this.name,
      this.sanitizer.bypassSecurityTrustResourceUrl(
        `assets/icons/${this.name}.svg`
      )
    );
  }
}
