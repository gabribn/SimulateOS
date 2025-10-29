import { Component } from "@angular/core";
import { MatDialogRef } from "@angular/material/dialog";
import { ProcessColors } from "src/app/shared/constants/process-colors.constants";

@Component({
    selector: "app-color-picker-dialog",
    templateUrl: "./color-picker-dialog.component.html",
    styleUrls: ["./color-picker-dialog.component.scss"],
})
export class ColorPickerDialogComponent {
    // readonly processColors = ProcessColors.filter((color) => color.isAvailable);

    constructor(public dialogRef: MatDialogRef<ColorPickerDialogComponent>) {}

    pickColor(color: string) {
        this.dialogRef.close(color);
    }

    getAvailableColors() {
        return ProcessColors.filter((color) => color.isAvailable);
    }
}
